"use client";

import { Mail, Shield, User as UserIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentUser } from "@/hooks/use-auth";
import { initials, relativeTime } from "@/lib/format";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

export default function ProfilePage() {
  const { data: user, isLoading } = useCurrentUser();

  return (
    <div>
      <PageHeader title="Profile" description="Your account details." />

      {isLoading || !user ? (
        <Skeleton className="h-64 w-full max-w-lg rounded-lg" />
      ) : (
        <Card className="max-w-lg">
          <CardHeader className="flex-row items-center gap-4 space-y-0">
            <Avatar className="h-14 w-14">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{user.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-3 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Name</span>
              <span className="ml-auto font-medium">{user.name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email</span>
              <span className="ml-auto font-medium">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Role</span>
              <span className="ml-auto font-medium">{ROLE_LABEL[user.role] ?? user.role}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="h-4 w-4" />
              <span className="text-muted-foreground">Member since</span>
              <span className="ml-auto font-medium">{relativeTime(user.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
