import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;

  const token =
    typeof params.token === "string"
      ? params.token
      : Array.isArray(params.token)
        ? params.token[0] ?? ""
        : "";

  return (
    <AuthShell
      mode="login"
      title="Create a new password"
      subtitle="Enter a secure new password for your account."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}