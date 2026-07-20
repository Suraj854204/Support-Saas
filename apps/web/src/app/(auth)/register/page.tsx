import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      mode="register"
      title="Create your workspace"
      subtitle="Create your organization and start delivering faster, AI-powered customer support."
    >
      <RegisterForm />
    </AuthShell>
  );
}