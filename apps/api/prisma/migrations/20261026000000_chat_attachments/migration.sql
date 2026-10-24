-- AlterTable
ALTER TABLE "attachments"
  ADD COLUMN "message_id" TEXT,
  ADD COLUMN "uploader_type" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN "uploader_id" TEXT,
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "resource_type" TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'document';

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
