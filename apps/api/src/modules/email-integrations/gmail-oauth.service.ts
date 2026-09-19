import crypto from "node:crypto";

import { google } from "googleapis";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

// Deliberately minimal, Gmail-specific scopes rather than broad Google
// Account access — gmail.modify covers read + label/thread management,
// gmail.send covers sending replies. Neither grants account deletion or
// access to anything outside Gmail.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const OAUTH_STATE_PREFIX = "gmail_oauth_state:";

export interface OAuthStatePayload {
  orgId: string;
  userId: string;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

function getOAuthClient() {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);
}

export const gmailOAuthService = {
  /**
   * Random, short-lived, and tied to the authenticated org+user — validated
   * again on callback so a forged/replayed state can't attach someone
   * else's Gmail account to this organization.
   */
  async createState(payload: OAuthStatePayload): Promise<string> {
    const state = crypto.randomUUID();
    await redis.set(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify(payload),
      "EX",
      env.GMAIL_OAUTH_STATE_TTL_SECONDS
    );
    return state;
  },

  /** Validates and immediately invalidates the state — single use, like a CSRF token. */
  async consumeState(state: string): Promise<OAuthStatePayload | null> {
    const key = `${OAUTH_STATE_PREFIX}${state}`;
    const raw = await redis.get(key);
    if (!raw) return null;
    await redis.del(key);
    try {
      return JSON.parse(raw) as OAuthStatePayload;
    } catch {
      return null;
    }
  },

  buildAuthUrl(state: string): string {
    const client = getOAuthClient();
    return client.generateAuthUrl({
      access_type: "offline", // required to receive a refresh token
      prompt: "consent", // force the consent screen so a refresh token is reissued even on reconnect
      scope: GMAIL_SCOPES,
      state,
      include_granted_scopes: false,
    });
  },

  async exchangeCodeForTokens(code: string): Promise<GoogleTokenSet> {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }
    if (!tokens.refresh_token) {
      // Happens if the user has already granted consent before and Google
      // decided not to reissue one, even with prompt=consent in rare cases.
      throw new Error(
        "Google did not return a refresh token. Please remove SupportFlow's access at https://myaccount.google.com/permissions and try connecting again."
      );
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000),
      scopes: tokens.scope ? tokens.scope.split(" ") : GMAIL_SCOPES,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Google did not return an access token on refresh");
    }

    return {
      accessToken: credentials.access_token,
      // Google usually doesn't rotate the refresh token on a plain refresh,
      // but if it does, the caller must persist the new one.
      refreshToken: credentials.refresh_token ?? undefined,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 55 * 60 * 1000),
      scopes: credentials.scope ? credentials.scope.split(" ") : GMAIL_SCOPES,
    };
  },

  /** Best-effort — a failed revoke shouldn't block the user from disconnecting in our own UI. */
  async revokeToken(token: string): Promise<void> {
    try {
      const client = getOAuthClient();
      await client.revokeToken(token);
    } catch (err) {
      logger.error({ err }, "Failed to revoke Google OAuth token (continuing with local disconnect anyway)");
    }
  },

  async fetchAccountIdentity(accessToken: string): Promise<{ providerAccountId: string; email: string }> {
    const client = getOAuthClient();
    client.setCredentials({ access_token: accessToken });

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const { data } = await oauth2.userinfo.get();

    if (!data.id || !data.email) {
      throw new Error("Google userinfo response was missing id/email");
    }

    return { providerAccountId: data.id, email: data.email };
  },
};
