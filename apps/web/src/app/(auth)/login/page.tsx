import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell
      mode="login"
      title="Welcome back"
      subtitle="Sign in to manage customer conversations, tickets and AI-powered support workflows."
    >
      <LoginForm />
    </AuthShell>
  );
}