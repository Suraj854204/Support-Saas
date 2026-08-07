"use client";

import { Mail, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  useConnectGmail,
  useDisconnectGmail,
  useEmailConnections,
  useSyncGmail,
  useUpdateEmailSettings,
} from "@/hooks/use-email-integrations";
import { ApiRequestError } from "@/lib/api-client";

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled before granting access.",
  invalid_or_expired_state: "That connection attempt expired. Please try again.",
  missing_code: "Google didn't return an authorization code. Please try again.",
  token_exchange_failed: "Couldn't exchange the authorization code with Google. Please try again.",
  identity_fetch_failed: "Couldn't confirm the connected Google account. Please try again.",
  inbox_already_connected: "Disconnect the current inbox before connecting a different Gmail account.",
};

const SYNC_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "muted"> = {
  idle: "success",
  syncing: "warning",
  error: "danger",
  disconnected: "muted",
};

export function IntegrationsClient() {
  const params = useSearchParams();
  const router = useRouter();
  const handledRedirect = useRef(false);

  const { data: currentUser } = useCurrentUser();
  const { data: connections, isLoading } = useEmailConnections();
  const connectGmail = useConnectGmail();
  const disconnectGmail = useDisconnectGmail();
  const syncGmail = useSyncGmail();
  const updateSettings = useUpdateEmailSettings();

  const isAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const activeConnection = connections?.find((c) => c.isActive);

  useEffect(() => {
    if (handledRedirect.current) return;
    const connected = params.get("gmail_connected");
    const error = params.get("gmail_error");

    if (connected || error) {
      handledRedirect.current = true;
      if (connected) toast.success("Gmail inbox connected");
      if (error) toast.error(GMAIL_ERROR_MESSAGES[error] ?? "Couldn't connect Gmail. Please try again.");
      router.replace("/settings/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleConnect = () => {
    connectGmail.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.authUrl;
      },
      onError: (err) => {
        toast.error(err instanceof ApiRequestError ? err.message : "Couldn't start the Gmail connection.");
      },
    });
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Only admins and owners can manage email integrations.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Gmail inbox</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : activeConnection ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{activeConnection.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeConnection.lastSyncedAt
                      ? `Last synced ${new Date(activeConnection.lastSyncedAt).toLocaleString()}`
                      : "Not synced yet"}
                  </p>
                  {activeConnection.lastError && (
                    <p className="mt-1 text-xs text-danger">{activeConnection.lastError}</p>
                  )}
                </div>
              </div>
              <Badge variant={SYNC_STATUS_VARIANT[activeConnection.syncStatus]} className="capitalize">
                {activeConnection.syncStatus}
              </Badge>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-create tickets</p>
                  <p className="text-xs text-muted-foreground">
                    Turn new customer emails into tickets automatically
                  </p>
                </div>
                <Switch
                  checked={activeConnection.settings.autoCreateTickets}
                  onCheckedChange={(checked) => updateSettings.mutate({ autoCreateTickets: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sync enabled</p>
                  <p className="text-xs text-muted-foreground">Pause syncing without fully disconnecting</p>
                </div>
                <Switch
                  checked={activeConnection.settings.syncEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ syncEnabled: checked })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={syncGmail.isPending}
                onClick={() =>
                  syncGmail.mutate(undefined, {
                    onSuccess: (result) =>
                      toast.success(
                        `Synced — ${result.processed} new ticket${result.processed === 1 ? "" : "s"}, ${result.skipped} skipped`
                      ),
                    onError: (err) =>
                      toast.error(err instanceof ApiRequestError ? err.message : "Sync failed."),
                  })
                }
              >
                <RefreshCw className="h-4 w-4" />
                {syncGmail.isPending ? "Syncing..." : "Sync now"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={disconnectGmail.isPending}
                onClick={() => {
                  if (!window.confirm(`Disconnect ${activeConnection.email}? Customers will stop getting replies from this inbox until you reconnect it.`)) {
                    return;
                  }
                  disconnectGmail.mutate(undefined, {
                    onSuccess: () => toast.success("Gmail inbox disconnected"),
                    onError: (err) =>
                      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't disconnect."),
                  });
                }}
              >
                {disconnectGmail.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your organization&apos;s support Gmail inbox. You&apos;ll be redirected to Google to
              grant access — SupportFlow never sees or stores your Gmail password.
            </p>
            <Button onClick={handleConnect} disabled={connectGmail.isPending}>
              <Mail className="h-4 w-4" />
              {connectGmail.isPending ? "Redirecting..." : "Connect Gmail"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
