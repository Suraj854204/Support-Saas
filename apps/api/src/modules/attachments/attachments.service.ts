import type { gmail_v1 } from "googleapis";


import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES, type ParsedAttachment } from "@/modules/email-integrations/gmail-message.parser";

/** Only a plain `type/subtype` is echoed back as Content-Type; anything odd from an email becomes a download-only blob. */
export function safeContentType(mime: string | null | undefined): string {
  return mime && /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,100}$/i.test(mime) ? mime.toLowerCase() : "application/octet-stream";
}

/** Content-Disposition for a download with a safe ASCII fallback plus the UTF-8 name (RFC 5987/6266). */
// Control characters are intentionally matched: they must never reach a header.
/* eslint-disable no-control-regex */
export function attachmentDisposition(filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 200) || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
/* eslint-enable no-control-regex */

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
        // The size in the email's metadata is claimed by the sender; enforce the limit on the real bytes too.
        if (buffer.length > MAX_ATTACHMENT_BYTES) {
          logger.warn({ gmailMessageId, filename: attachment.filename, bytes: buffer.length }, "Attachment larger than its declared size; not stored");
          continue;
        }
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
