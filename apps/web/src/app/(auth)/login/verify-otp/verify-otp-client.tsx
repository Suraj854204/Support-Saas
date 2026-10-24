"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { VerifyOtpForm } from "@/components/auth/verify-otp-form";

export function VerifyOtpClient() {
  const params = useSearchParams();
  const router = useRouter();

  const challengeId = params.get("challengeId");
  const maskedEmail = params.get("maskedEmail");

  if (!challengeId || !maskedEmail) {
    // Landed here directly without a challenge (e.g. refreshed after it
    // expired) — send back to login rather than rendering a broken form.
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  return <VerifyOtpForm challengeId={challengeId} maskedEmail={maskedEmail} />;
}
