-- Additive: no existing data is changed or dropped.
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

ALTER TABLE "organizations" ADD COLUMN "ai_reply_mode" TEXT NOT NULL DEFAULT 'copilot';

ALTER TABLE "ticket_messages"
  ADD COLUMN "client_message_id" TEXT,
  ADD COLUMN "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'delivered',
  ADD COLUMN "ai_meta" JSONB;

-- NULL client ids are distinct in Postgres, so existing rows are unaffected.
CREATE UNIQUE INDEX "ticket_messages_ticket_id_client_message_id_key" ON "ticket_messages"("ticket_id", "client_message_id");
