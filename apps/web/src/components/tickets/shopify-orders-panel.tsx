"use client";

import { Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useShopifyOrders, useShopifyStatus } from "@/hooks/use-data-connections";
import { relativeTime } from "@/lib/format";

/** Renders nothing unless the org connected Shopify, so existing ticket pages are unchanged for everyone else. */
export function ShopifyOrdersPanel({ email }: { email: string | null | undefined }) {
  const { data: status } = useShopifyStatus();
  const connected = status?.connected === true;
  const { data: orders, isLoading, isError } = useShopifyOrders(email, connected);

  if (!connected || !email) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Store className="h-3 w-3" /> Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading orders…</p>
        ) : isError ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load orders from Shopify.</p>
        ) : !orders || orders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No orders found for this email.</p>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{o.name}</span>
                <span>
                  {o.total} {o.currency}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {o.cancelled && <Badge variant="danger">cancelled</Badge>}
                <Badge variant="muted">{o.financialStatus ?? "unknown"}</Badge>
                <Badge variant={o.fulfillmentStatus === "fulfilled" ? "success" : "warning"}>{o.fulfillmentStatus}</Badge>
                <span className="text-muted-foreground">{relativeTime(o.createdAt)}</span>
              </div>
              <p className="truncate text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}</p>
              {o.tracking.map((t, i) => (
                <p key={i} className="truncate">
                  {t.company} {t.url ? (
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {t.number}
                    </a>
                  ) : (
                    t.number
                  )}
                </p>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
