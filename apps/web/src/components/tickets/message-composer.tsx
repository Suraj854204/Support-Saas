"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, MessageSquareText, Paperclip, Send, Wand2, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCannedResponses } from "@/hooks/use-canned-responses";
import { useApplyMacro, useMacros } from "@/hooks/use-macros";
import { useAddTicketMessage, useUploadTicketAttachment } from "@/hooks/use-tickets";
import { ApiRequestError } from "@/lib/api-client";
import type { Attachment } from "@support-saas/shared-types";
import { cn } from "@/lib/utils";

const composerSchema = z.object({
  body: z.string(),
  isInternalNote: z.boolean().default(false),
});
const MAX_FILES = 5;
const MAX_BYTES = 50 * 1024 * 1024;

interface PendingFile {
  key: string;
  name: string;
  attachment?: Attachment;
  error?: string;
}
type ComposerValues = z.infer<typeof composerSchema>;

const TYPING_IDLE_MS = 2000;

export interface MessageComposerHandle {
  /** Replaces the current draft — used by the AI suggestion card's "Use this reply". */
  insertText: (text: string) => void;
}

export const MessageComposer = forwardRef<
  MessageComposerHandle,
  { ticketId: string; onTyping: (state: "start" | "stop") => void }
>(function MessageComposer({ ticketId, onTyping }, ref) {
  const addMessage = useAddTicketMessage();
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: cannedResponses } = useCannedResponses();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [macroOpen, setMacroOpen] = useState(false);
  const { data: macros } = useMacros();
  const applyMacro = useApplyMacro();
  const upload = useUploadTicketAttachment();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = files.some((f) => !f.attachment && !f.error);

  function addFiles(list: FileList | File[] | null | undefined) {
    const incoming = Array.from(list ?? []);
    const room = MAX_FILES - files.length;
    if (incoming.length > room) toast.error(`You can attach up to ${MAX_FILES} files per message.`);
    incoming.slice(0, Math.max(0, room)).forEach((file) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const name = file.name || "screenshot.png";
      if (file.size > MAX_BYTES) {
        setFiles((prev) => [...prev, { key, name, error: "too large (max 50 MB)" }]);
        return;
      }
      setFiles((prev) => [...prev, { key, name }]);
      upload.mutate(
        { ticketId, file },
        {
          onSuccess: (attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f))),
          onError: (e) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: e instanceof ApiRequestError ? e.message : "upload failed" } : f))),
        }
      );
    });
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: { body: "", isInternalNote: false },
  });

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => setValue("body", text, { shouldValidate: true }),
  }));

  const isInternalNote = watch("isInternalNote");

  function handleKeystroke() {
    onTyping("start");
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping("stop"), TYPING_IDLE_MS);
  }

  const onSubmit = (values: ComposerValues) => {
    const attachmentIds = files.flatMap((f) => (f.attachment ? [f.attachment.id] : []));
    if (!values.body.trim() && attachmentIds.length === 0) {
      toast.error("Write a reply or attach a file before sending");
      return;
    }
    addMessage.mutate(
      { ticketId, body: values.body, isInternalNote: values.isInternalNote, attachmentIds },
      {
        onSuccess: () => {
          reset({ body: "", isInternalNote: values.isInternalNote });
          setFiles([]);
          if (typingTimeout.current) clearTimeout(typingTimeout.current);
          onTyping("stop");
        },
        onError: () => toast.error("Couldn't send that message. Try again."),
      }
    );
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-2 border-t border-border p-3", isInternalNote && "bg-warning/5", dragging && "ring-2 ring-primary ring-inset")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <Textarea
        placeholder={isInternalNote ? "Add an internal note (not visible to the customer)..." : "Write a reply..."}
        rows={3}
        {...register("body")}
        onPaste={(e) => {
          if (e.clipboardData.files.length > 0) {
            e.preventDefault(); // a pasted screenshot becomes an attachment
            addFiles(e.clipboardData.files);
          }
        }}
        onKeyDown={(e) => {
          handleKeystroke();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit(onSubmit)();
          }
        }}
      />
      {errors.body && <p className="text-xs text-danger">{errors.body.message}</p>}

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Files to send">
          {files.map((f) => (
            <li key={f.key} className={cn("flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs", f.error && "bg-danger/10 text-danger")}>
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="text-muted-foreground">{f.error ? `- ${f.error}` : f.attachment ? "" : "- uploading..."}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Attach photos, screenshots, videos or documents (you can also paste or drop them)"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach
          </button>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={isInternalNote} onCheckedChange={(checked) => setValue("isInternalNote", checked)} />
            <Lock className="h-3 w-3" />
            Internal note
          </label>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Canned response
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1">
              {!cannedResponses || cannedResponses.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No canned responses yet — add some in Settings.
                </p>
              ) : (
                cannedResponses.map((cr) => (
                  <button
                    key={cr.id}
                    type="button"
                    className="block w-full rounded-md p-2 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      setValue("body", cr.body, { shouldValidate: true });
                      setPickerOpen(false);
                    }}
                  >
                    {cr.name}
                  </button>
                ))
              )}
            </PopoverContent>
          </Popover>

          <Popover open={macroOpen} onOpenChange={setMacroOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Wand2 className="h-3.5 w-3.5" />
                Macros
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1">
              {!macros || macros.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">No macros yet. An admin can add them in Settings.</p>
              ) : (
                macros.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={applyMacro.isPending}
                    className="block w-full rounded-md p-2 text-left text-xs hover:bg-muted disabled:opacity-60"
                    onClick={() =>
                      applyMacro.mutate(
                        { macroId: m.id, ticketId },
                        {
                          onSuccess: (r) => {
                            setMacroOpen(false);
                            toast.success(r.replied ? `"${m.name}" applied and reply sent` : `"${m.name}" applied`);
                          },
                          onError: () => toast.error("Couldn't apply that macro."),
                        }
                      )
                    }
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {[m.replyBody ? "Sends a reply" : null, m.setStatus ? `Status: ${m.setStatus.replace("_", " ")}` : null, m.setPriority ? `Priority: ${m.setPriority}` : null, m.addTags.length ? `+${m.addTags.length} tag` : null].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))
              )}
            </PopoverContent>
          </Popover>
        </div>

        <Button type="submit" size="sm" disabled={addMessage.isPending || uploading} className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          {addMessage.isPending ? "Sending..." : isInternalNote ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
});

