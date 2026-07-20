"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/api-client";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your work email")
    .email("Enter a valid email address"),

  password: z.string().min(1, "Enter your password"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    if (login.isPending) {
      return;
    }

    login.mutate({
      email: values.email.trim().toLowerCase(),
      password: values.password,
    });
  };

  const errorMessage =
    login.error instanceof ApiRequestError
      ? login.error.message
      : "Something went wrong. Please try again.";

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
              htmlFor="email"
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
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "email-error" : undefined
                }
                className={getInputClass(Boolean(errors.email))}
                {...register("email")}
              />
            </div>

            {errors.email ? (
              <ErrorMessage
                id="email-error"
                message={errors.email.message}
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-[#292C35]"
              >
                Password
              </Label>

              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[#8A6D2A] transition hover:text-[#6F551F] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8C93]"
              />

              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                className={`${getInputClass(
                  Boolean(errors.password),
                )} pr-11`}
                {...register("password")}
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                aria-pressed={showPassword}
                className="absolute right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8B8C93] transition hover:bg-[#171B26]/[0.05] hover:text-[#292C35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/40"
              >
                {showPassword ? (
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
            </div>

            {errors.password ? (
              <ErrorMessage
                id="password-error"
                message={errors.password.message}
              />
            ) : null}
          </div>

          {login.isError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3.5 py-3 text-xs text-red-700"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />

              <p className="leading-5">{errorMessage}</p>
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={login.isPending}
            className="group h-12 w-full rounded-xl bg-[#171B26] text-sm font-semibold text-[#F3EFE6] shadow-lg shadow-[#171B26]/15 transition duration-200 hover:bg-[#252A37] hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {login.isPending ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="mr-2 h-4 w-4 animate-spin"
                />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <ArrowRight
                  aria-hidden="true"
                  className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </>
            )}
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#171B26]/10" />

            <span className="text-[10px] uppercase tracking-[0.16em] text-[#A2A3AB]">
              Secure access
            </span>

            <div className="h-px flex-1 bg-[#171B26]/10" />
          </div>

          <div className="flex items-center justify-center gap-2 rounded-xl border border-[#171B26]/[0.08] bg-[#171B26]/[0.025] px-3 py-2.5 text-center text-[11px] text-[#8B8C93]">
            <ShieldCheck
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[#2FA9A1]"
            />

            Protected authentication for your workspace
          </div>

          <p className="text-center text-xs leading-5 text-[#8B8C93]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-[#8A6D2A] transition hover:text-[#6F551F] hover:underline"
            >
              Create account
            </Link>
          </p>
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