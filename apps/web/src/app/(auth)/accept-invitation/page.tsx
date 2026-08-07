import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";

import { AcceptInvitationClient } from "./accept-invitation-client";

export default function AcceptInvitationPage() {
  return (
    <AuthShell title="Join your team" subtitle="Set a password to finish joining your organization">
      <Suspense fallback={null}>
        <AcceptInvitationClient />
      </Suspense>
    </AuthShell>
  );
}
