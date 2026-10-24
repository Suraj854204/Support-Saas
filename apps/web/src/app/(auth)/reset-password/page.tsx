import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";

import { ResetPasswordClient } from "./reset-password-client";

export const metadata: Metadata = { title: "Reset password — Loop" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      mode="reset-password"
      title="Set a new password"
      subtitle="Choose a strong password for your Loop account"
    >
      <Suspense fallback={null}>
        <ResetPasswordClient />
      </Suspense>
    </AuthShell>
  );
}
