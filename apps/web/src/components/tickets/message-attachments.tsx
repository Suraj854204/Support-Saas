"use client";

import { Download, FileText } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { Attachment } from "@support-saas/shared-types";

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Images and videos play in place; documents are download links. Links are short-lived and refreshed with the ticket. */
export function MessageAttachments({ attachments }: { attachments?: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {attachments.map((a) => {
        if (a.kind === "image") {
          return (
            <a key={a.id} href={apiUrl(a.downloadUrl)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.filename}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apiUrl(a.url)} alt={a.filename} loading="lazy" className="max-h-64 max-w-full rounded-md border border-border bg-muted object-contain" />
            </a>
          );
        }
        if (a.kind === "video") {
          return <video key={a.id} controls preload="metadata" src={apiUrl(a.url)} aria-label={a.filename} className="max-h-64 max-w-full rounded-md bg-black" />;
        }
        if (a.kind === "audio") {
          return <audio key={a.id} controls preload="metadata" src={apiUrl(a.url)} aria-label={a.filename} className="max-w-full" />;
        }
        return (
          <a
            key={a.id}
            href={apiUrl(a.downloadUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{a.filename}</span>
            <span className="shrink-0 text-muted-foreground">{sizeLabel(a.sizeBytes)}</span>
            <Download className="h-3.5 w-3.5 shrink-0" />
          </a>
        );
      })}
    </div>
  );
}
