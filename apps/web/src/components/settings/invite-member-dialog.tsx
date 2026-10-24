"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, UserPlus } from "lucide-react";
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
import { useCreateInvitation } from "@/hooks/use-invitations";
import { ApiRequestError } from "@/lib/api-client";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const createInvitation = useCreateInvitation();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "agent" },
  });

  const onSubmit = (values: InviteValues) => {
    createInvitation.mutate(values, {
      onSuccess: () => {
        setSentTo(values.email);
        toast.success("Invitation sent");
      },
      onError: (err) => {
        toast.error(err instanceof ApiRequestError ? err.message : "Couldn't send invitation. Try again.");
      },
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset({ email: "", role: "agent" });
      setSentTo(null);
    }
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
        {sentTo ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation sent</DialogTitle>
            </DialogHeader>
            <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p>
                We emailed an invitation to <span className="font-medium">{sentTo}</span>. It expires in a
                few days if they don&apos;t accept it.
              </p>
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

              <p className="text-xs text-muted-foreground">
                They&apos;ll get an email with a secure link to set their own password and join your
                organization.
              </p>
            </div>

            <DialogFooter className="mt-6">
              <Button type="submit" disabled={createInvitation.isPending}>
                {createInvitation.isPending ? "Sending..." : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
