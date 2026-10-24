import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { gmailSyncService } from "@/modules/email-integrations/gmail-sync.service";

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let running = false;

async function pollActiveConnections() {
  if (running) return; // don't overlap a slow run with the next tick
  running = true;

  try {
    const connections = await prisma.emailConnection.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const { id } of connections) {
      try {
        await gmailSyncService.syncConnection(id);
      } catch (err) {
        // Isolated per connection — one org's expired/broken credentials
        // must never stop every other org's inbox from syncing.
        logger.error({ err, connectionId: id }, "Scheduled Gmail sync failed for a connection");
      }
    }
  } finally {
    running = false;
  }
}

export function startGmailSyncWorker(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    logger.warn("Gmail sync worker not started — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not configured");
    return;
  }

  intervalHandle = setInterval(() => void pollActiveConnections(), env.GMAIL_SYNC_POLL_INTERVAL_SECONDS * 1000);
  logger.info(
    { intervalSeconds: env.GMAIL_SYNC_POLL_INTERVAL_SECONDS },
    "Gmail sync worker started (scheduled polling)"
  );
}

export function stopGmailSyncWorker(): void {
  if (intervalHandle) clearInterval(intervalHandle);
}
