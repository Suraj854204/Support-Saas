"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUpdateTicket } from "@/hooks/use-tickets";

export function TicketTagsEditor({ ticketId, tags }: { ticketId: string; tags: string[] }) {
  const updateTicket = useUpdateTicket();
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const tag = draft.trim();
    if (!tag || tags.includes(tag)) {
      setDraft("");
      return;
    }
    updateTicket.mutate({ id: ticketId, tags: [...tags, tag] } as never);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    updateTicket.mutate({ id: ticketId, tags: tags.filter((t) => t !== tag) } as never);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="muted" className="gap-1">
            {tag}
            <button onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
      </div>
      <Input
        placeholder="Add a tag and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}
