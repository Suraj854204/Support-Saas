import type { EmailConnection } from "@prisma/client";

import { DEFAULT_EMAIL_CONNECTION_SETTINGS, type EmailConnectionSettings } from "./email-integration.types";
import { gmailOAuthService } from "./gmail-oauth.service";
import type { GmailCallbackQuery, PatchEmailSettingsInput } from "./email-integration.schema";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000; // refresh if expiring within 2 minutes

function buildFrontendRedirect(params: Record<string, string>): string {
  const url = new URL("/settings/integrations", env.NEXT_PUBLIC_APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Returns a live access token for this connection, transparently refreshing
 * (and persisting the new token) if the current one is at or near expiry.
 * Used by both the manual "sync now" endpoint here and, in the next phase,
 * the background sync worker.
 */
export async function ensureFreshAccessToken(
  connection: EmailConnection
): Promise<{ accessToken: string; connection: EmailConnection }> {
  const msUntilExpiry = connection.tokenExpiresAt.getTime() - Date.now();

  if (msUntilExpiry > TOKEN_REFRESH_BUFFER_MS) {
    return { accessToken: decryptSecret(connection.accessTokenEncrypted), connection };
  }

  const refreshToken = decryptSecret(connection.refreshTokenEncrypted);
  const refreshed = await gmailOAuthService.refreshAccessToken(refreshToken);

  const updated = await prisma.emailConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encryptSecret(refreshed.accessToken),
      // Google usually doesn't rotate the refresh token on a plain refresh —
      // only overwrite ours if it actually sent a new one.
      refreshTokenEncrypted: refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
      lastError: null,
    },
  });

  return { accessToken: refreshed.accessToken, connection: updated };
}

export const emailIntegrationService = {
  async initiateConnect(orgId: string, userId: string): Promise<{ authUrl: string }> {
    const state = await gmailOAuthService.createState({ orgId, userId });
    return { authUrl: gmailOAuthService.buildAuthUrl(state) };
  },

  /**
   * Returns a frontend redirect URL rather than throwing — OAuth callbacks
   * are a plain browser GET with no way to render a JSON error usefully, so
   * every failure path here ends in "send the browser back to Settings
   * with a query param explaining what went wrong" instead.
   */
  async handleCallback(query: GmailCallbackQuery): Promise<{ redirectUrl: string }> {
    if (query.error) {
      return { redirectUrl: buildFrontendRedirect({ gmail_error: query.error }) };
    }

    const statePayload = await gmailOAuthService.consumeState(query.state);
    if (!statePayload) {
      return { redirectUrl: buildFrontendRedirect({ gmail_error: "invalid_or_expired_state" }) };
    }

    if (!query.code) {
      return { redirectUrl: buildFrontendRedirect({ gmail_error: "missing_code" }) };
    }

    let tokens;
    try {
      tokens = await gmailOAuthService.exchangeCodeForTokens(query.code);
    } catch (err) {
      logger.error({ err }, "Gmail OAuth code exchange failed");
      return { redirectUrl: buildFrontendRedirect({ gmail_error: "token_exchange_failed" }) };
    }

    let identity;
    try {
      identity = await gmailOAuthService.fetchAccountIdentity(tokens.accessToken);
    } catch (err) {
      logger.error({ err }, "Failed to fetch Google account identity after Gmail OAuth");
      return { redirectUrl: buildFrontendRedirect({ gmail_error: "identity_fetch_failed" }) };
    }

    const existingActive = await prisma.emailConnection.findFirst({
      where: { orgId: statePayload.orgId, isActive: true },
    });

    if (existingActive && existingActive.providerAccountId !== identity.providerAccountId) {
      return { redirectUrl: buildFrontendRedirect({ gmail_error: "inbox_already_connected" }) };
    }

    const connection = await prisma.emailConnection.upsert({
      where: {
        provider_providerAccountId_orgId: {
          provider: "gmail",
          providerAccountId: identity.providerAccountId,
          orgId: statePayload.orgId,
        },
      },
      create: {
        orgId: statePayload.orgId,
        provider: "gmail",
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: encryptSecret(tokens.refreshToken as string),
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        isActive: true,
        syncStatus: "idle",
        settings: DEFAULT_EMAIL_CONNECTION_SETTINGS,
        connectedById: statePayload.userId,
      },
      update: {
        accessTokenEncrypted: encryptSecret(tokens.accessToken),
        refreshTokenEncrypted: encryptSecret(tokens.refreshToken as string),
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        isActive: true,
        syncStatus: "idle",
        lastError: null,
        connectedById: statePayload.userId,
      },
    });

    await recordAudit({
      orgId: statePayload.orgId,
      actorId: statePayload.userId,
      action: "email_integration.connected",
      targetType: "email_connection",
      targetId: connection.id,
      metadata: { email: identity.email },
    });

    return { redirectUrl: buildFrontendRedirect({ gmail_connected: "1" }) };
  },

  async list(orgId: string) {
    return prisma.emailConnection.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  },

  async disconnect(orgId: string, actorId: string) {
    const connection = await prisma.emailConnection.findFirst({ where: { orgId, isActive: true } });
    if (!connection) throw AppError.notFound("No active email connection found for this organization");

    try {
      const accessToken = decryptSecret(connection.accessTokenEncrypted);
      await gmailOAuthService.revokeToken(accessToken);
    } catch (err) {
      // Revocation is best-effort — proceed with the local disconnect regardless.
      logger.error({ err }, "Gmail token revoke failed during disconnect");
    }

    const updated = await prisma.emailConnection.update({
      where: { id: connection.id },
      data: {
        isActive: false,
        syncStatus: "disconnected",
        // Tokens are revoked and no longer usable — don't keep them at rest.
        accessTokenEncrypted: encryptSecret(""),
        refreshTokenEncrypted: encryptSecret(""),
      },
    });

    await recordAudit({
      orgId,
      actorId,
      action: "email_integration.disconnected",
      targetType: "email_connection",
      targetId: connection.id,
    });

    return updated;
  },

  async updateSettings(orgId: string, patch: PatchEmailSettingsInput) {
    const connection = await prisma.emailConnection.findFirst({ where: { orgId, isActive: true } });
    if (!connection) throw AppError.notFound("No active email connection found for this organization");

    const currentSettings: EmailConnectionSettings = {
      ...DEFAULT_EMAIL_CONNECTION_SETTINGS,
      ...((connection.settings as Partial<EmailConnectionSettings> | null) ?? {}),
    };

    return prisma.emailConnection.update({
      where: { id: connection.id },
      data: { settings: { ...currentSettings, ...patch } },
    });
  },
};
