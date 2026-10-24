"use client";

import { CalendarDays, Mail, PlayCircle, Shield } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ProductGuide } from "@/components/guide/product-guide";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-auth";
import { useOnboarding } from "@/hooks/use-onboarding";
import { initials } from "@/lib/format";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent", viewer: "Viewer" };
const ROLE_HINT: Record<string, string> = {
  owner: "You can manage everything, including billing and team access.",
  admin: "You can manage settings, integrations and the team.",
  agent: "You can work on tickets, customers and articles.",
  viewer: "You can view tickets and reports.",
};

function ProfileInner() {
  const { data: user, isLoading } = useCurrentUser();
  const { update } = useOnboarding(user?.id);
  const params = useSearchParams();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  if (isLoading || !user) return <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />;

  const since = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <Tabs defaultValue={params.get("tab") === "guide" ? "guide" : "account"} className="space-y-6">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="guide" onClick={() => update({ guideRead: true })}>Guide</TabsTrigger>
      </TabsList>

      <TabsContent value="account" className="space-y-4">
        <div className="max-w-2xl overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div className="h-20 bg-gradient-to-r from-primary/25 via-ai/15 to-transparent" />
          <div className="px-6">
            <div className="-mt-10 flex items-end justify-between">
              <Avatar className="h-20 w-20 border-4 border-surface">
                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                <AvatarFallback className="text-2xl">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <Badge variant="muted">{ROLE_LABEL[user.role] ?? user.role}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{user.name}</h2>
            <p className="mb-5 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            {[
              { icon: Mail, label: "Email", value: user.email },
              { icon: Shield, label: "Role", value: ROLE_LABEL[user.role] ?? user.role },
              { icon: CalendarDays, label: "Member since", value: since },
            ].map((r) => (
              <div key={r.label} className="bg-surface p-4">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><r.icon className="h-3.5 w-3.5" />{r.label}</dt>
                <dd className="mt-1 truncate text-sm font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border px-6 py-3 text-sm text-muted-foreground">{ROLE_HINT[user.role]}</p>
        </div>

        <div className="flex max-w-2xl items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card">
          <PlayCircle className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">New here?</p>
            <p className="text-sm text-muted-foreground">Replay the welcome tour and show the Getting started checklist again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { update({ tourSeen: false, checklistDismissed: false }); window.location.assign("/dashboard"); }}>
            Replay
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="guide">
        <ProductGuide isAdmin={isAdmin} onRead={() => update({ guideRead: true })} />
      </TabsContent>
    </Tabs>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Profile" description="Your account, and a step-by-step guide to every part of Loop." />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-2xl rounded-xl" />}>
        <ProfileInner />
      </Suspense>
    </div>
  );
}
