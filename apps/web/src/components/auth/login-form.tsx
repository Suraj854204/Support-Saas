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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/api-client";
import { useAppDispatch } from "@/store";
import { setCredentials } from "@/store/slices/auth-slice";

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
  const router = useRouter();

  const login = useLogin();
  const dispatch = useAppDispatch();

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

    login.mutate(
      {
        email: values.email.trim().toLowerCase(),
        password: values.password,
      },
      {
        onSuccess: (data) => {
          if (data.requiresOtp) {
            // Normal case: hand off to the OTP verification step.
            const params = new URLSearchParams({
              challengeId: data.challengeId,
              maskedEmail: data.maskedEmail,
              expiresInSeconds: String(data.expiresInSeconds),
            });
            router.push(`/login/verify-otp?${params.toString()}`);
            return;
          }

          // Trusted-device bypass: credentials issued immediately, no OTP step.
          dispatch(
            setCredentials({ user: data.user, accessToken: data.accessToken }),
          );
          router.push("/dashboard");
        },
      },
    );
  };

  const errorMessage =
    login.error instanceof ApiRequestError
      ? login.error.message
      : "Something went wrong. Please try again.";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="h-10 pl-9"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </div>
        {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground transition-colors hover:text-primary">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            className="h-10 px-9"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
      </div>

      {login.isError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <Button type="submit" className="h-10 w-full gap-2" disabled={login.isPending}>
        {login.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your details
          </>
        ) : (
          <>
            Continue <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Loop?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}
