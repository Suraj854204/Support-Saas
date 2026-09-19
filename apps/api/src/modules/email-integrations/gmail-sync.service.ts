import { google, type gmail_v1 } from "googleapis";

import { ensureFreshAccessToken } from "./email-integration.service";
import { ingestParsedMessage } from "./email-ticket-ingestion.service";
import { parseGmailMessage } from "./gmail-message.parser";
import { DEFAULT_EMAIL_CONNECTION_SETTINGS, type EmailConnectionSettings } from "./email-integration.types";

import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { attachmentsService } from "@/modules/attachments/attachments.service";
import type { EmailConnection } from "@prisma/client";

function buildAuthedClient(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

function isHistoryCheckpointExpired(err: unknown): boolean {
  const code = (err as { code?: number; response?: { status?: number } })?.code;
  const status = (err as { response?: { status?: number } })?.response?.status;
  return code === 404 || status === 404;
}

/**
 * Returns the Gmail message IDs to process this sync. Uses the stored
 * `historyId` checkpoint whenever one exists — only a brand-new connection,
 * or one whose checkpoint fell outside Gmail's ~7 day history retention
 * window, falls back to a bounded `messages.list` fetch instead of a full
 * inbox rescan.
 */
async function listNewMessageIds(gmail: gmail_v1.Gmail, connection: EmailConnection): Promise<string[]> {
  if (!connection.historyId) {
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults: env.GMAIL_INITIAL_SYNC_LIMIT,
      labelIds: ["INBOX"],
    });
    return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  }

  try {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId: connection.historyId,
      historyTypes: ["messageAdded"],
    });

    const ids = new Set<string>();
    for (const entry of res.data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id);
      }
    }
    return Array.from(ids);
  } catch (err) {
    if (!isHistoryCheckpointExpired(err)) throw err;

    logger.warn(
      { connectionId: connection.id },
      "Gmail history checkpoint expired — falling back to a bounded resync"
    );
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults: env.GMAIL_INITIAL_SYNC_LIMIT,
      labelIds: ["INBOX"],
    });
    return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  }
}

export const gmailSyncService = {
  /**
   * Real Gmail sync: refreshes credentials if needed, walks new messages
   * since the last checkpoint (or a bounded initial fetch for a fresh
   * connection), parses + sanitizes each one, and hands it to the
   * email-to-ticket pipeline (deduplicated by Gmail message ID — see
   * email-ticket-ingestion.service.ts). Ends by recording a fresh
   * `historyId` checkpoint via a real `users.getProfile` call.
   */
  async syncConnection(connectionId: string): Promise<{ processed: number; skipped: number; failed: number }> {
    const connection = await prisma.emailConnection.findUnique({ where: { id: connectionId } });
    if (!connection) throw new Error("Email connection not found");
    if (!connection.isActive) throw new Error("Email connection is not active");

    const settings: EmailConnectionSettings = {
      ...DEFAULT_EMAIL_CONNECTION_SETTINGS,
      ...((connection.settings as Partial<EmailConnectionSettings> | null) ?? {}),
    };

    if (!settings.syncEnabled) {
      return { processed: 0, skipped: 0, failed: 0 };
    }

    await prisma.emailConnection.update({ where: { id: connectionId }, data: { syncStatus: "syncing" } });

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const { accessToken, connection: freshConnection } = await ensureFreshAccessToken(connection);
      const authClient = buildAuthedClient(accessToken);
      const gmail = google.gmail({ version: "v1", auth: authClient });

      const messageIds = await listNewMessageIds(gmail, freshConnection);

      for (const messageId of messageIds) {
        try {
          const { data } = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
          const parsed = parseGmailMessage(data, freshConnection.email);

          const outcome = await ingestParsedMessage(
            freshConnection,
            parsed,
            settings.autoCreateTickets ? undefined : "auto_create_disabled"
          );

          if (outcome.skipped) {
            skipped++;
          } else {
            processed++;
            if (parsed.attachments.some((a) => !a.blocked)) {
              await attachmentsService.downloadAndStore(
                gmail,
                messageId,
                freshConnection.orgId,
                outcome.ticketId,
                outcome.inboundMessageId,
                parsed.attachments
              );
            }
          }
        } catch (err) {
          failed++;
          logger.error({ err, connectionId, messageId }, "Failed to process an individual Gmail message");
        }
      }

      const profile = await gmail.users.getProfile({ userId: "me" });

      await prisma.emailConnection.update({
        where: { id: connectionId },
        data: {
          historyId: profile.data.historyId ?? freshConnection.historyId,
          syncStatus: "idle",
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });

      return { processed, skipped, failed };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Gmail sync error";
      logger.error({ err, connectionId }, "Gmail sync failed");
      await prisma.emailConnection.update({
        where: { id: connectionId },
        data: { syncStatus: "error", lastError: message },
      });
      throw err;
    }
  },
};
