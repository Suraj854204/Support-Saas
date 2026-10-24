import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { attemptDelivery } from "@/modules/webhooks/webhook-delivery.service";

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 25;
const CONCURRENCY = 5;
/** How long a claimed delivery is hidden from other workers while it is being attempted. */
const LEASE_MS = 2 * 60_000;
const RETENTION_DAYS = 30;
const CLEANUP_EVERY_MS = 60 * 60_000;

let intervalHandle: ReturnType<typeof setInterval> | undefined;
let running = false;
let lastCleanupAt = 0;

/**
 * Pulls due deliveries and claims each with a conditional update, so two API
 * replicas polling the same table never send the same delivery twice: only
 * the replica whose UPDATE matches the row's current state wins the claim.
 */
async function processDueDeliveries() {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: BATCH_SIZE,
    include: { endpoint: true },
  });

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const chunk = due.slice(i, i + CONCURRENCY);

    await Promise.allSettled(
      chunk.map(async (delivery) => {
        const claimed = await prisma.webhookDelivery.updateMany({
          where: { id: delivery.id, status: "pending", attempts: delivery.attempts, nextAttemptAt: delivery.nextAttemptAt },
          data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) },
        });
        if (claimed.count !== 1) return;

        await attemptDelivery(delivery);
      })
    );
  }
}

async function cleanupOldDeliveries() {
  if (Date.now() - lastCleanupAt < CLEANUP_EVERY_MS) return;
  lastCleanupAt = Date.now();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
  await prisma.webhookDelivery.deleteMany({
    where: { status: { in: ["delivered", "dead"] }, createdAt: { lt: cutoff } },
  });
}

async function tick() {
  if (running) return;
  running = true;

  try {
    await processDueDeliveries();
    await cleanupOldDeliveries();
  } catch (err) {
    logger.error({ err }, "Webhook delivery sweep failed");
  } finally {
    running = false;
  }
}

export function startWebhookDeliveryWorker(): void {
  intervalHandle = setInterval(() => void tick(), POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Webhook delivery worker started");
}

export function stopWebhookDeliveryWorker(): void {
  if (intervalHandle) clearInterval(intervalHandle);
}
