"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useResendLoginOtp, useVerifyLoginOtp } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/api-client";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyOtpForm({
  challengeId,
  maskedEmail,
}: {
  challengeId: string;
  maskedEmail: string;
}) {
  const [otp, setOtp] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const verify = useVerifyLoginOtp();
  const resend = useResendLoginOtp();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verify.mutate({ challengeId, otp, rememberDevice });
  };

  const onResend = () => {
    resend.mutate(
      { challengeId },
      {
        onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
      }
    );
  };

  const error = verify.error ?? resend.error;

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{maskedEmail}</span>. It
            expires in a few minutes.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className="text-center text-lg tracking-[0.5em]"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Trust this device</p>
              <p className="text-xs text-muted-foreground">Skip the code on this device for 30 days</p>
            </div>
            <Switch checked={rememberDevice} onCheckedChange={setRememberDevice} />
          </div>

          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {error instanceof ApiRequestError ? error.message : "Something went wrong. Please try again."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={verify.isPending || otp.length !== 6}>
            {verify.isPending ? "Verifying..." : "Verify and sign in"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={cooldown > 0 || resend.isPending}
            onClick={onResend}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : resend.isPending ? "Sending..." : "Resend code"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
