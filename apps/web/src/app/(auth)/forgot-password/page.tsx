import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password — Loop" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      mode="forgot-password"
      title="Forgot your password?"
      subtitle="Enter your work email and we'll send you a reset link"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
