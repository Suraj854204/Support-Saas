"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, apiClient } from "@/lib/api-client";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128, "Password is too long"),

    confirmPassword: z
      .string()
      .min(1, "Confirm your new password"),
  })
  .refine(
    (values) => values.password === values.confirmPassword,
    {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    },
  );

type ResetPasswordFormValues = z.infer<
  typeof resetPasswordSchema
>;

type ResetPasswordResult = {
  message: string;
};

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({
  token,
}: ResetPasswordFormProps) {
  const router = useRouter();

  const redirectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const password = watch("password", "");

  const passwordChecks = {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };

  const normalizedToken = token.trim();

  const onSubmit = async (
    values: ResetPasswordFormValues,
  ): Promise<void> => {
    if (isSubmitting || !normalizedToken) {
      return;
    }

    setIsSubmitting(true);
    setRequestError("");
    setSuccessMessage("");

    try {
      const result =
        await apiClient.post<ResetPasswordResult>(
          "/api/auth/reset-password",
          {
            token: normalizedToken,
            password: values.password,
          },
          {
            skipAuth: true,
          },
        );

      setSuccessMessage(
        result.message ||
          "Your password has been reset successfully.",
      );

      redirectTimerRef.current = setTimeout(() => {
        router.replace("/login");
      }, 1800);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (
          error.code === "INVALID_RESET_TOKEN" ||
          error.status === 400 ||
          error.status === 401
        ) {
          setRequestError(
            "This password reset link is invalid or has expired. Please request a new one.",
          );
        } else {
          setRequestError(error.message);
        }
      } else {
        setRequestError(
          "We could not reset your password. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!normalizedToken) {
    return <InvalidTokenState />;
  }

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
              <h2 className="font-display text-lg font-semibold text-[#171B26]">
                Password updated
              </h2>

              <p className="font-body mt-2 text-sm leading-6 text-[#5B5C63]">
                {successMessage}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-[#8B8C93]">
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin"
              />

              Redirecting to sign in...
            </div>

            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#171B26] px-4 text-sm font-medium text-[#F3EFE6] transition hover:bg-[#252A37]"
            >
              Continue to sign in
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
              htmlFor="new-password"
              className="text-sm font-medium text-[#292C35]"
            >
              New password
            </Label>

            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8C93]"
              />

              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Create a new password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password
                    ? "new-password-error password-rules"
                    : "password-rules"
                }
                className={`${getInputClass(
                  Boolean(errors.password),
                )} pr-11`}
                {...register("password")}
              />

              <PasswordToggle
                visible={showPassword}
                onToggle={() =>
                  setShowPassword((current) => !current)
                }
                showLabel="Show new password"
                hideLabel="Hide new password"
              />
            </div>

            {errors.password ? (
              <ErrorMessage
                id="new-password-error"
                message={errors.password.message}
              />
            ) : null}

            <div
              id="password-rules"
              className="grid gap-2 pt-1 sm:grid-cols-3"
            >
              <PasswordRule
                passed={passwordChecks.length}
                label="8+ characters"
              />

              <PasswordRule
                passed={passwordChecks.letter}
                label="One letter"
              />

              <PasswordRule
                passed={passwordChecks.number}
                label="One number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirm-password"
              className="text-sm font-medium text-[#292C35]"
            >
              Confirm password
            </Label>

            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8C93]"
              />

              <Input
                id="confirm-password"
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                autoComplete="new-password"
                placeholder="Repeat your new password"
                aria-invalid={Boolean(
                  errors.confirmPassword,
                )}
                aria-describedby={
                  errors.confirmPassword
                    ? "confirm-password-error"
                    : undefined
                }
                className={`${getInputClass(
                  Boolean(errors.confirmPassword),
                )} pr-11`}
                {...register("confirmPassword")}
              />

              <PasswordToggle
                visible={showConfirmPassword}
                onToggle={() =>
                  setShowConfirmPassword(
                    (current) => !current,
                  )
                }
                showLabel="Show confirmed password"
                hideLabel="Hide confirmed password"
              />
            </div>

            {errors.confirmPassword ? (
              <ErrorMessage
                id="confirm-password-error"
                message={
                  errors.confirmPassword.message
                }
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

              <div className="space-y-2">
                <p className="leading-5">
                  {requestError}
                </p>

                <Link
                  href="/forgot-password"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Request another reset link
                </Link>
              </div>
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

                Updating password...
              </>
            ) : (
              "Reset password"
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

function InvalidTokenState() {
  return (
    <Card className="overflow-hidden border-0 bg-transparent shadow-none">
      <CardContent className="p-5 sm:p-7">
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/[0.06]">
            <AlertCircle
              aria-hidden="true"
              className="h-7 w-7 text-red-600"
            />
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold text-[#171B26]">
              Invalid reset link
            </h2>

            <p className="font-body mt-2 text-sm leading-6 text-[#5B5C63]">
              This password reset link is missing its
              security token.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#171B26] px-4 text-sm font-semibold text-[#F3EFE6] transition hover:bg-[#252A37]"
          >
            Request a new reset link
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 text-xs font-medium text-[#8A6D2A] hover:underline"
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

function PasswordToggle({
  visible,
  onToggle,
  showLabel,
  hideLabel,
}: {
  visible: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? hideLabel : showLabel}
      aria-pressed={visible}
      className="absolute right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8B8C93] transition hover:bg-[#171B26]/[0.05] hover:text-[#292C35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/40"
    >
      {visible ? (
        <EyeOff
          aria-hidden="true"
          className="h-4 w-4"
        />
      ) : (
        <Eye
          aria-hidden="true"
          className="h-4 w-4"
        />
      )}
    </button>
  );
}

function ErrorMessage({
  id,
  message,
}: {
  id: string;
  message: string;
}) {
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

function PasswordRule({
  passed,
  label,
}: {
  passed: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 text-[10px] transition ${
        passed ? "text-[#2A8E87]" : "text-[#A2A3AB]"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
          passed
            ? "border-[#2FA9A1]/30 bg-[#2FA9A1]/10"
            : "border-[#171B26]/10 bg-[#171B26]/[0.02]"
        }`}
      >
        <Check
          aria-hidden="true"
          className="h-2.5 w-2.5"
        />
      </span>

      {label}
    </div>
  );
}

function getInputClass(hasError: boolean) {
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