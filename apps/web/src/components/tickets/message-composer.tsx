"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Send } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAddTicketMessage } from "@/hooks/use-tickets";
import { cn } from "@/lib/utils";

const composerSchema = z.object({
  body: z.string().min(1, "Write a reply before sending"),
  isInternalNote: z.boolean().default(false),
});
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
    addMessage.mutate(
      { ticketId, body: values.body, isInternalNote: values.isInternalNote },
      {
        onSuccess: () => {
          reset({ body: "", isInternalNote: values.isInternalNote });
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
      className={cn("flex flex-col gap-2 border-t border-border p-3", isInternalNote && "bg-warning/5")}
    >
      <Textarea
        placeholder={isInternalNote ? "Add an internal note (not visible to the customer)..." : "Write a reply..."}
        rows={3}
        {...register("body")}
        onKeyDown={(e) => {
          handleKeystroke();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit(onSubmit)();
          }
        }}
      />
      {errors.body && <p className="text-xs text-danger">{errors.body.message}</p>}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={isInternalNote} onCheckedChange={(checked) => setValue("isInternalNote", checked)} />
          <Lock className="h-3 w-3" />
          Internal note
        </label>

        <Button type="submit" size="sm" disabled={addMessage.isPending} className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          {addMessage.isPending ? "Sending..." : isInternalNote ? "Add note" : "Send reply"}
        </Button>
      </div>
    </form>
  );
});

