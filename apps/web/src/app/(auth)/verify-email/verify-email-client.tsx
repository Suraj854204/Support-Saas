"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSendVerificationEmail, useVerifyEmail } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/api-client";
import { useAppSelector } from "@/store";

type Status = "verifying" | "success" | "error";

export function VerifyEmailClient() {
  const params = useSearchParams();
  const token = params.get("token");
  const isAuthenticated = Boolean(useAppSelector((s) => s.auth.accessToken));

  const verifyEmail = useVerifyEmail();
  const sendVerification = useSendVerificationEmail();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [resendEmail, setResendEmail] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    verifyEmail.mutate(token, {
      onSuccess: () => setStatus("success"),
      onError: () => setStatus("error"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6 text-center">
        {status === "verifying" && <p className="text-sm text-muted-foreground">Verifying your email…</p>}

        {status === "success" && (
          <>
            <p className="text-sm">Your email is verified. You're all set.</p>
            <Button asChild className="w-full">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <p className="text-sm text-danger">
              {!token
                ? "This link is missing a verification token."
                : verifyEmail.error instanceof ApiRequestError
                  ? verifyEmail.error.message
                  : "This verification link is invalid or has expired."}
            </p>
            {!isAuthenticated && !sendVerification.isSuccess && (
              <Input
                type="email"
                placeholder="you@company.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
            )}

            <Button
              variant="outline"
              className="w-full"
              disabled={
                sendVerification.isPending || sendVerification.isSuccess || (!isAuthenticated && !resendEmail)
              }
              onClick={() => sendVerification.mutate(isAuthenticated ? undefined : resendEmail)}
            >
              {sendVerification.isSuccess
                ? "New link sent — check your email"
                : sendVerification.isPending
                  ? "Sending..."
                  : "Send me a new link"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
