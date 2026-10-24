"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SecretRevealDialog } from "@/components/developers/secret-reveal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { API_KEY_SCOPES, useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-developers";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

export function ApiKeysCard() {
  const { data: keys, isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["tickets:read"]);
  const [newKey, setNewKey] = useState<string | null>(null);

  const onCreate = () => {
    if (!name.trim() || scopes.length === 0) {
      toast.error("Give the key a name and at least one scope.");
      return;
    }
    create.mutate(
      { name: name.trim(), scopes },
      {
        onSuccess: (res) => {
          setNewKey(res.key);
          setName("");
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't create the key."),
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Create API key</CardTitle>
          <p className="text-xs text-muted-foreground">
            Use keys with the public API at <code className="font-mono">/api/public/v1</code> via the{" "}
            <code className="font-mono">X-API-Key</code> header.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production backend" maxLength={80} />
          </div>
          <div className="flex flex-wrap gap-4">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onCheckedChange={(v) => setScopes((s) => (v === true ? [...s, scope] : s.filter((x) => x !== scope)))}
                />
                <span className="font-mono text-xs">{scope}</span>
              </label>
            ))}
          </div>
          <Button size="sm" onClick={onCreate} disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create key"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !keys || keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <Card key={k.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{k.name}</span>
                    {k.revokedAt && <Badge variant="danger">Revoked</Badge>}
                    {!k.revokedAt && k.expiresAt && new Date(k.expiresAt) < new Date() && <Badge variant="warning">Expired</Badge>}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {k.keyPrefix}… · {k.scopes.join(", ")} · {k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                {!k.revokedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${k.name}`}
                    disabled={revoke.isPending}
                    onClick={() => {
                      if (window.confirm(`Revoke "${k.name}"? Anything using it will stop working immediately.`)) {
                        revoke.mutate(k.id, { onError: () => toast.error("Couldn't revoke the key.") });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SecretRevealDialog secret={newKey} title="Your new API key" onClose={() => setNewKey(null)} />
    </div>
  );
}
