import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      mode="login"
      title="Forgot your password?"
      subtitle="Enter your registered work email and we’ll send you a secure password reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}