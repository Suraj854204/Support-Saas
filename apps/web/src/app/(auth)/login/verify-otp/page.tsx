import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";

import { VerifyOtpClient } from "./verify-otp-client";

export default function VerifyOtpPage() {
  return (
    <AuthShell title="Check your email" subtitle="Enter the verification code to finish signing in">
      <Suspense fallback={null}>
        <VerifyOtpClient />
      </Suspense>
    </AuthShell>
  );
}
