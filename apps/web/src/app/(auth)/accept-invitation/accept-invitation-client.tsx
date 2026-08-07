"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcceptInvitation } from "@/hooks/use-invitations";
import { ApiRequestError } from "@/lib/api-client";

const acceptSchema = z.object({
  name: z.string().min(2, "Enter your full name").max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type AcceptValues = z.infer<typeof acceptSchema>;

export function AcceptInvitationClient() {
  const params = useSearchParams();
  const token = params.get("token");
  const acceptInvitation = useAcceptInvitation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptValues>({ resolver: zodResolver(acceptSchema) });

  if (!token) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-danger">
          This invitation link is missing a token. Ask whoever invited you to send a new one.
        </CardContent>
      </Card>
    );
  }

  const onSubmit = (values: AcceptValues) => {
    acceptInvitation.mutate({ token, ...values });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" placeholder="Alex Agent" {...register("name")} />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Create a password</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>

          {acceptInvitation.isError && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {acceptInvitation.error instanceof ApiRequestError
                ? acceptInvitation.error.message
                : "Something went wrong. Try again."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={acceptInvitation.isPending}>
            {acceptInvitation.isPending ? "Joining..." : "Join organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
