import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account — Loop" };

export default function RegisterPage() {
  return (
    <AuthShell title="Set up your workspace" subtitle="Create your organization in Loop">
      <RegisterForm />
    </AuthShell>
  );
}
