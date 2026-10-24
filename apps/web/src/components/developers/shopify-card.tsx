"use client";

import { Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnectShopify, useDisconnectShopify, useShopifyStatus } from "@/hooks/use-data-connections";
import { ApiRequestError } from "@/lib/api-client";

export function ShopifyCard() {
  const { data: status, isLoading } = useShopifyStatus();
  const connect = useConnectShopify();
  const disconnect = useDisconnectShopify();
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  if (isLoading || !status) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Store className="h-4 w-4" /> Shopify orders
          {status.connected && <Badge variant="success">Connected</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Agents see a customer&apos;s recent orders, fulfilment and tracking next to the ticket. Create a custom app in Shopify with the{" "}
          <code className="font-mono">read_orders</code> scope and paste its Admin API access token. The token is encrypted at rest.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-sm">{status.shopDomain}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => {
                if (window.confirm("Disconnect Shopify?")) {
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success("Shopify disconnected"),
                    onError: () => toast.error("Couldn't disconnect."),
                  });
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="shop-domain">Shop domain</Label>
              <Input id="shop-domain" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} placeholder="your-store.myshopify.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-token">Admin API access token</Label>
              <Input
                id="shop-token"
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="shpat_..."
              />
            </div>
            <Button
              size="sm"
              disabled={connect.isPending || !shopDomain.trim() || !accessToken.trim()}
              onClick={() =>
                connect.mutate(
                  { shopDomain: shopDomain.trim(), accessToken: accessToken.trim() },
                  {
                    onSuccess: () => {
                      setAccessToken("");
                      toast.success("Shopify connected");
                    },
                    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't connect to Shopify."),
                  }
                )
              }
            >
              {connect.isPending ? "Verifying..." : "Connect"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
