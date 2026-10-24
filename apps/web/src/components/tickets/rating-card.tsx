"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitRating } from "@/hooks/use-csat";
import { ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const LABELS = ["Very bad", "Bad", "Okay", "Good", "Great"];

/** Shown to the customer on the tracking page once their request is resolved. */
export function RatingCard({ token, existing }: { token: string; existing: { rating: number; comment: string | null } | null }) {
  const submit = useSubmitRating(token);
  const [value, setValue] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [editing, setEditing] = useState(!existing);

  const send = () =>
    submit.mutate(
      { rating: value, ...(comment.trim() && { comment: comment.trim() }) },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Thanks for your feedback!");
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save your rating. Try again."),
      }
    );

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-medium">{existing && !editing ? "Thanks for rating this request" : "How did we do?"}</p>
        <div role="radiogroup" aria-label="Rate your support experience" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n - 1]}`}
              disabled={!editing}
              onClick={() => setValue(n)}
              className="rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
            >
              <Star className={cn("h-7 w-7", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
            </button>
          ))}
          {value > 0 && <span className="ml-2 self-center text-sm text-muted-foreground">{LABELS[value - 1]}</span>}
        </div>
        {editing ? (
          <>
            <Textarea placeholder="Anything we could do better? (optional)" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-16" />
            <Button size="sm" onClick={send} disabled={value === 0 || submit.isPending}>
              {submit.isPending ? "Sending..." : existing ? "Update rating" : "Send rating"}
            </Button>
          </>
        ) : (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setEditing(true)}>
            Change my rating
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
