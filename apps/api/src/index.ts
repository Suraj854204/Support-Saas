import { createServer } from "http";

import { createApp } from "@/app";
import { env } from "@/config/env";
import { connectProducer, disconnectProducer } from "@/lib/kafka";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { initSocketServer } from "@/sockets";
import { startAnalyticsConsumer, stopAnalyticsConsumer } from "@/worker/analytics-consumer";
import { startEmailOutboxWorker, stopEmailOutboxWorker } from "@/worker/email-outbox.worker";
import { startGmailSyncWorker, stopGmailSyncWorker } from "@/worker/gmail-sync.worker";
import { startSlaAutomationWorker, stopSlaAutomationWorker } from "@/worker/sla-automation.worker";

async function main() {
  const app = createApp();
  const httpServer = createServer(app);

  initSocketServer(httpServer);

  await connectProducer();
  void startAnalyticsConsumer(); // long-running; don't block server startup on it
  startGmailSyncWorker();
  startEmailOutboxWorker();
  startSlaAutomationWorker();

  httpServer.listen(env.API_PORT, () => {
    logger.info(`🚀 API listening on port ${env.API_PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    httpServer.close();
    stopGmailSyncWorker();
    stopEmailOutboxWorker();
    stopSlaAutomationWorker();
    await Promise.allSettled([
      prisma.$disconnect(),
      redis.quit(),
      disconnectProducer(),
      stopAnalyticsConsumer(),
    ]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});

