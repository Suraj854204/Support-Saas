"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/api-client";

const registerSchema = z.object({
  orgName: z.string().min(2, "Tell us your company name"),
  name: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: ["Too short", "Weak", "Okay", "Good", "Strong"][score] ?? "" };
}

export function RegisterForm() {
  const registerAccount = useRegister();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = passwordStrength(password);

  const onSubmit = (values: RegisterFormValues) => {
    if (registerAccount.isPending) {
      return;
    }

    // useRegister's own onSuccess already dispatches setCredentials and
    // routes to /dashboard — don't override navigation here, or you'll
    // get bounced back to /login right after the account is created.
    registerAccount.mutate(values);
  };

  const errorMessage =
    registerAccount.error instanceof ApiRequestError
      ? registerAccount.error.message
      : "Something went wrong. Please try again.";

  return (
    <>
      <div>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="orgName">
              Company name
            </Label>

            <Input
              id="orgName"
              placeholder="Acme Inc."
              {...register("orgName")}
            />

            {errors.orgName && (
              <p className="text-xs text-danger">
                {errors.orgName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">
              Your name
            </Label>

            <Input
              id="name"
              placeholder="Ava Owner"
              {...register("name")}
            />

            {errors.name && (
              <p className="text-xs text-danger">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">
              Work email
            </Label>

            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              {...register("email")}
            />

            {errors.email && (
              <p className="text-xs text-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">
              Password
            </Label>

            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              {...register("password")}
            />

            {password.length > 0 && (
              <div className="flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1 flex-1 rounded-full bg-muted transition-colors",
                        strength.score >= n && (strength.score <= 1 ? "bg-danger" : strength.score === 2 ? "bg-warning" : "bg-success")
                      )}
                    />
                  ))}
                </div>
                <span className="w-16 text-right text-xs text-muted-foreground">{strength.label}</span>
              </div>
            )}
            {errors.password && (
              <p className="text-xs text-danger">
                {errors.password.message}
              </p>
            )}
          </div>

          {registerAccount.isError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {errorMessage}
            </p>
          )}

          <Button
            type="submit"
            className="h-10 w-full"
            disabled={registerAccount.isPending}
          >
            {registerAccount.isPending
              ? "Creating account..."
              : "Create account"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}

            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}