import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";

import { VerifyEmailClient } from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Verify your email" subtitle="Confirming your SupportFlow account">
      <Suspense fallback={null}>
        <VerifyEmailClient />
      </Suspense>
    </AuthShell>
  );
}
