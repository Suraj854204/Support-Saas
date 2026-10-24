"use client";

import { useSearchParams } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export function ResetPasswordClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  return <ResetPasswordForm token={token} />;
}
