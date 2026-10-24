import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      mode="register"
      title="Create your workspace"
      subtitle="Set up your organization. You can invite your team right after."
    >
      <RegisterForm />
    </AuthShell>
  );
}