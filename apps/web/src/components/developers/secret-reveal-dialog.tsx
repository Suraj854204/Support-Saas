"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a secret exactly once (API key / webhook signing secret). It can never be read back from the server. */
export function SecretRevealDialog({
  secret,
  title,
  onClose,
}: {
  secret: string | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy it now — for security it won&apos;t be shown again.</DialogDescription>
        </DialogHeader>
        <code className="block break-all rounded-md border border-border bg-muted p-3 font-mono text-xs">{secret}</code>
        <DialogFooter>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              if (secret) void navigator.clipboard.writeText(secret).then(() => toast.success("Copied"));
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
