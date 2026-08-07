"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser, useSendVerificationEmail } from "@/hooks/use-auth";

export function EmailVerificationBanner() {
  const { data: user } = useCurrentUser();
  const sendVerification = useSendVerificationEmail();
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm">
      <span>
        Verify your email to unlock Gmail connections, billing, and team invitations.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={sendVerification.isPending || sendVerification.isSuccess}
          onClick={() => sendVerification.mutate(undefined)}
        >
          {sendVerification.isSuccess ? "Link sent" : sendVerification.isPending ? "Sending..." : "Resend link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
