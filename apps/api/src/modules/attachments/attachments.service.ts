import type { gmail_v1 } from "googleapis";

import type { ParsedAttachment } from "@/modules/email-integrations/gmail-message.parser";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export const attachmentsService = {
  /**
   * Downloads and stores every non-blocked attachment on a message that's
   * already been ingested (ticket created or appended to). Failures on one
   * attachment never take down the rest — each is independent.
   */
  async downloadAndStore(
    gmail: gmail_v1.Gmail,
    gmailMessageId: string,
    orgId: string,
    ticketId: string,
    inboundEmailMessageId: string,
    attachments: ParsedAttachment[]
  ): Promise<void> {
    for (const attachment of attachments) {
      if (attachment.blocked) continue;

      try {
        const { data } = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: gmailMessageId,
          id: attachment.gmailAttachmentId,
        });
        if (!data.data) continue;

        const buffer = Buffer.from(data.data, "base64url");
        const storageKey = await storage.save(orgId, buffer);

        await prisma.attachment.create({
          data: {
            orgId,
            ticketId,
            inboundEmailMessageId,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            sizeBytes: buffer.length,
            storageKey,
          },
        });
      } catch (err) {
        logger.error(
          { err, gmailMessageId, filename: attachment.filename },
          "Failed to download/store a Gmail attachment"
        );
      }
    }
  },

  /** Org-scoped lookup for the download endpoint — never returns another org's attachment. */
  async getForDownload(orgId: string, attachmentId: string) {
    return prisma.attachment.findFirst({ where: { id: attachmentId, orgId } });
  },
};
