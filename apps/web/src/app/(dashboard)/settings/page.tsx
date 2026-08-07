"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Mail, MessageSquareText, Zap } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog";
import { InvitationsTable } from "@/components/settings/invitations-table";
import { MembersTable } from "@/components/settings/members-table";
import { SlaSettingsCard } from "@/components/settings/sla-settings-card";
import { useCurrentUser } from "@/hooks/use-auth";
import { useCurrentOrg, useUpdateOrg } from "@/hooks/use-org";

const orgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  domain: z.string().optional(),
  defaultTicketPriority: z.enum(["low", "normal", "high", "urgent"]),
});
type OrgValues = z.infer<typeof orgSchema>;

export default function SettingsPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: org, isLoading } = useCurrentOrg();
  const updateOrg = useUpdateOrg();
  const { theme, setTheme } = useTheme();

  const isAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: "", domain: "", defaultTicketPriority: "normal" },
  });

  useEffect(() => {
    if (org) reset({ name: org.name, domain: org.domain ?? "", defaultTicketPriority: org.defaultTicketPriority });
  }, [org, reset]);

  const onSubmit = (values: OrgValues) => {
    updateOrg.mutate(
      { name: values.name, domain: values.domain || null, defaultTicketPriority: values.defaultTicketPriority },
      {
        onSuccess: () => toast.success("Organization settings saved"),
        onError: () => toast.error("Couldn't save settings. Try again."),
      }
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Manage your organization and preferences." />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Organization</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !org ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Organization name</Label>
                <Input id="name" disabled={!isAdmin} {...register("name")} />
                {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="domain">Domain</Label>
                <Input id="domain" disabled={!isAdmin} placeholder="acme.com" {...register("domain")} />
              </div>

              <div className="space-y-1.5">
                <Label>Default priority for new email tickets</Label>
                <Select
                  value={watch("defaultTicketPriority")}
                  onValueChange={(v) => setValue("defaultTicketPriority", v as OrgValues["defaultTicketPriority"])}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant="muted" className="capitalize">
                  {org.planTier}
                </Badge>
              </div>

              {isAdmin ? (
                <Button type="submit" disabled={updateOrg.isPending}>
                  {updateOrg.isPending ? "Saving..." : "Save changes"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only admins and owners can edit organization settings.
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium">Members</CardTitle>
          {isAdmin && <InviteMemberDialog />}
        </CardHeader>
        <CardContent>
          <MembersTable currentUserId={currentUser?.id} isAdmin={isAdmin} />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardContent className="pt-6">
            <Link
              href="/settings/integrations"
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>
                  <span className="font-medium">Integrations</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Connect a Gmail inbox to turn customer emails into tickets
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardContent className="pt-6">
            <Link href="/settings/automations" className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span>
                  <span className="font-medium">Automation rules</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Auto-tag, prioritize, assign, or email based on ticket conditions
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdmin && <SlaSettingsCard />}

      <Card>
        <CardContent className="pt-6">
          <Link href="/settings/canned-responses" className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              <span>
                <span className="font-medium">Canned responses</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Reusable reply text for tickets and automation rules
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label>Theme</Label>
            <Select value={theme ?? "system"} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
