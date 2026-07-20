"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, apiClient } from "@/lib/api-client";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your work email")
    .email("Enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<
  typeof forgotPasswordSchema
>;

type ForgotPasswordResponse = {
  success?: boolean;
  message?: string;
  data?: {
    message?: string;
  };
};

const DEFAULT_SUCCESS_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

export function ForgotPasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (
    values: ForgotPasswordFormValues,
  ): Promise<void> => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setRequestError("");
    setSuccessMessage("");

    try {
      const response =
        await apiClient.post<ForgotPasswordResponse>(
          "/api/auth/forgot-password",
          {
            email: values.email.trim().toLowerCase(),
          },
          {
            skipAuth: true,
          },
        );

      const message =
        response?.data?.message ??
        response?.message ??
        DEFAULT_SUCCESS_MESSAGE;

      setRequestError("");
      setSuccessMessage(message);
      reset();
    } catch (error: unknown) {
      setSuccessMessage("");

      if (error instanceof ApiRequestError) {
        setRequestError(
          error.message ||
            "We could not send the reset email. Please try again.",
        );
      } else {
        setRequestError(
          "We could not send the reset email. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendAnother = (): void => {
    setSuccessMessage("");
    setRequestError("");
    reset();
  };

  if (successMessage) {
    return (
      <Card className="overflow-hidden border-0 bg-transparent shadow-none">
        <CardContent className="p-5 sm:p-7">
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2FA9A1]/20 bg-[#2FA9A1]/10">
              <CheckCircle2
                aria-hidden="true"
                className="h-7 w-7 text-[#2FA9A1]"
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[#171B26]">
                Check your email
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#5B5C63]">
                {successMessage}
              </p>
            </div>

            <div className="rounded-xl border border-[#171B26]/[0.08] bg-[#171B26]/[0.025] px-4 py-3 text-xs leading-5 text-[#8B8C93]">
              The reset link expires in 15 minutes. Check your
              spam folder if you do not see the email.
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleSendAnother}
              className="h-11 w-full rounded-xl border-[#171B26]/10 bg-white text-[#292C35] hover:bg-[#171B26]/[0.04]"
            >
              Send another link
            </Button>

            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 text-xs font-medium text-[#8A6D2A] transition hover:text-[#6F551F] hover:underline"
            >
              <ArrowLeft
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />

              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-0 bg-transparent shadow-none">
      <CardContent className="p-5 sm:p-7">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-2">
            <Label
              htmlFor="forgot-email"
              className="text-sm font-medium text-[#292C35]"
            >
              Work email
            </Label>

            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8C93]"
              />

              <Input
                id="forgot-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email
                    ? "forgot-email-error"
                    : undefined
                }
                className={getInputClass(
                  Boolean(errors.email),
                )}
                {...register("email")}
              />
            </div>

            {errors.email ? (
              <ErrorMessage
                id="forgot-email-error"
                message={errors.email.message}
              />
            ) : null}
          </div>

          {requestError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3.5 py-3 text-xs text-red-700"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />

              <p className="leading-5">{requestError}</p>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="group h-12 w-full rounded-xl bg-[#171B26] text-sm font-semibold text-[#F3EFE6] shadow-lg shadow-[#171B26]/15 transition hover:bg-[#252A37] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />

                Sending reset link...
              </>
            ) : (
              <>
                <Send
                  aria-hidden="true"
                  className="mr-2 h-4 w-4"
                />

                Send reset link
              </>
            )}
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-xs font-medium text-[#8A6D2A] transition hover:text-[#6F551F] hover:underline"
          >
            <ArrowLeft
              aria-hidden="true"
              className="h-3.5 w-3.5"
            />

            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

function ErrorMessage({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className="flex items-center gap-1.5 text-xs text-red-600"
    >
      <AlertCircle
        aria-hidden="true"
        className="h-3.5 w-3.5"
      />

      {message}
    </p>
  );
}

function getInputClass(hasError: boolean): string {
  return [
    "h-12 rounded-xl border-[#171B26]/10 bg-white",
    "pl-10 pr-4 text-[#171B26] placeholder:text-[#A2A3AB]",
    "transition duration-200",
    "hover:border-[#171B26]/20",
    "focus-visible:border-[#D9A441]",
    "focus-visible:ring-4 focus-visible:ring-[#D9A441]/10",
    hasError
      ? "border-red-500/50 focus-visible:border-red-500 focus-visible:ring-red-500/10"
      : "",
  ].join(" ");
}