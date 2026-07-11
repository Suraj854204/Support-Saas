"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInviteMember } from "@/hooks/use-users";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "agent", "viewer"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type InviteValues = z.infer<typeof inviteSchema>;

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const inviteMember = useInviteMember();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", role: "agent", password: generatePassword() },
  });

  const onSubmit = (values: InviteValues) => {
    inviteMember.mutate(values, {
      onSuccess: () => {
        setCreatedCreds({ email: values.email, password: values.password });
        toast.success("Teammate added");
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Couldn't add teammate. Try again.");
      },
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset({ name: "", email: "", role: "agent", password: generatePassword() });
      setCreatedCreds(null);
    }
  };

  const copyCreds = () => {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        {createdCreds ? (
          <>
            <DialogHeader>
              <DialogTitle>Teammate added</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                There&apos;s no email delivery configured, so share these sign-in details with{" "}
                {createdCreds.email} yourself — they should change the password after logging in.
              </p>
              <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                <div>Email: {createdCreds.email}</div>
                <div>Password: {createdCreds.password}</div>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyCreds}>
                <Copy className="h-3.5 w-3.5" />
                Copy credentials
              </Button>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register("name")} placeholder="Alex Agent" />
                {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register("email")} placeholder="alex@acme.com" />
                {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={watch("role")} onValueChange={(v) => setValue("role", v as InviteValues["role"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Initial password</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setValue("password", generatePassword())}
                  >
                    Regenerate
                  </button>
                </div>
                <Input id="password" className="font-mono" {...register("password")} />
                {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="submit" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Adding..." : "Add teammate"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
