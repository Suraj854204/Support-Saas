"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function RegisterForm() {
  const registerAccount = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = (values: RegisterFormValues) => registerAccount.mutate(values);

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Company name</Label>
            <Input id="orgName" placeholder="Acme Inc." {...register("orgName")} />
            {errors.orgName && <p className="text-xs text-danger">{errors.orgName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" placeholder="Ava Owner" {...register("name")} />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" placeholder="you@company.com" {...register("email")} />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="At least 8 characters" {...register("password")} />
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>

          {registerAccount.isError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {registerAccount.error instanceof ApiRequestError
                ? registerAccount.error.message
                : "Something went wrong. Please try again."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={registerAccount.isPending}>
            {registerAccount.isPending ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}