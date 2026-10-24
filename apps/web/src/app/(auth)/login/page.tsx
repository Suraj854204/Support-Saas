import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      mode="login"
      title="Welcome back"
      subtitle="Sign in to your workspace. We may email you a one-time code to confirm it's you."
    >
      <LoginForm />
    </AuthShell>
  );
}