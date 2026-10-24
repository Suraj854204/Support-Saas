"use client";

import { AlertTriangle, Check, CreditCard, Download, Receipt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-auth";
import { useBilling, useCheckout, useInvoices, usePortal, useSetOverage, type PlanLimits } from "@/hooks/use-billing";
import { ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const fmt = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString());
const inr = (rupees: number) => `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const inrPaise = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used.toLocaleString()} / {fmt(limit)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={used}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: limit === null ? "6%" : `${pct}%` }} />
      </div>
    </div>
  );
}

const LIMIT_ROWS: { key: keyof PlanLimits; text: (n: number | null) => string }[] = [
  { key: "seats", text: (n) => `${fmt(n)} team ${n === 1 ? "member" : "members"}` },
  { key: "aiRepliesPerMonth", text: (n) => `${fmt(n)} AI replies / month` },
  { key: "articles", text: (n) => `${fmt(n)} knowledge ${n === 1 ? "article" : "articles"}` },
  { key: "forms", text: (n) => `${fmt(n)} ${n === 1 ? "form or assistant" : "forms and assistants"}` },
];

function BillingInner() {
  const params = useSearchParams();
  const justPaid = params.get("checkout") === "success";
  const { data: user } = useCurrentUser();
  const [pollUntil, setPollUntil] = useState(0);
  const { data, isLoading, isError, refetch } = useBilling(Date.now() < pollUntil);
  const checkout = useCheckout();
  const portal = usePortal();
  const setOverage = useSetOverage();
  const hasBillingAccount = Boolean(data?.subscription);
  const invoices = useInvoices(hasBillingAccount);

  useEffect(() => {
    if (justPaid) {
      setPollUntil(Date.now() + 30_000);
      const t = setTimeout(() => setPollUntil(0), 30_000);
      return () => clearTimeout(t);
    }
  }, [justPaid]);

  const canManage = user?.role === "owner" || user?.role === "admin";

  const go = (mutate: (cb: { onSuccess: (r: { url: string }) => void; onError: (e: unknown) => void }) => void) =>
    mutate({
      onSuccess: (r) => window.location.assign(r.url),
      onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't open billing. Try again."),
    });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-6 text-sm">
          <span>Couldn&apos;t load billing. You need the owner or admin role to see this page.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sub = data.subscription;
  const pastDue = sub?.status === "past_due";
  const renews = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <div className="space-y-6">
      {justPaid && (
        <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Thanks! Your payment went through. Your plan updates in a few seconds.
        </div>
      )}
      {pastDue && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your last payment failed. Your plan stays active while we retry, but please update your card in “Manage billing” to avoid losing access.
          </span>
        </div>
      )}
      {!data.billingEnabled && (
        <div role="note" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Online payments are not set up on this server yet, so plan changes are unavailable. Your current limits still apply.
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Current plan: {data.plan.name}
            {sub?.cancelAtPeriodEnd && <Badge variant="warning">Ends {renews}</Badge>}
          </CardTitle>
          {canManage && sub?.hasPaymentMethodOnFile && (
            <Button variant="outline" size="sm" disabled={portal.isPending} onClick={() => go((cb) => portal.mutate(undefined, cb))}>
              Manage billing
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Meter label="Team members" used={data.usage.seats} limit={data.plan.limits.seats} />
          <Meter label="AI replies this month" used={data.usage.aiReplies} limit={data.plan.limits.aiRepliesPerMonth} />
          <Meter label="Knowledge articles" used={data.usage.articles} limit={data.plan.limits.articles} />
          <Meter label="Forms and assistants" used={data.usage.forms} limit={data.plan.limits.forms} />
          {renews && !sub?.cancelAtPeriodEnd && <p className="text-xs text-muted-foreground sm:col-span-2">Renews on {renews}.</p>}
        </CardContent>
      </Card>

      {data.overage.offered && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pay-per-use AI replies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              When your {fmt(data.plan.limits.aiRepliesPerMonth)} monthly AI replies run out, replies can continue at {inr(data.overage.ratePerReplyInr ?? 0)} each + GST, billed on your next invoice.
              Capped at {fmt(data.overage.capUnits)} extra replies a month. Off by default: with it off, AI replies stop and chats go to your team.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="tabular-nums">
                This month: {data.overage.usedUnits.toLocaleString()} extra · about {inr(data.overage.estimatedChargeInr)} + GST
              </span>
              <Button
                variant={data.overage.enabled ? "outline" : "default"}
                size="sm"
                disabled={!canManage || !data.overage.available || setOverage.isPending}
                onClick={() =>
                  setOverage.mutate(!data.overage.enabled, {
                    onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't change this setting."),
                  })
                }
              >
                {data.overage.enabled ? "Turn off" : "Turn on"}
              </Button>
            </div>
            {!data.overage.available && <p className="text-xs text-muted-foreground">Available once a paid plan is active.</p>}
          </CardContent>
        </Card>
      )}

      {hasBillingAccount && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" /> Invoices and payment receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : invoices.isError ? (
              <p className="text-sm text-muted-foreground">Couldn&apos;t load invoices right now.</p>
            ) : (invoices.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet. Your first one appears after your first payment.</p>
            ) : (
              <ul className="divide-y text-sm">
                {invoices.data!.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{i.number ?? "Invoice"}</span>
                      <span className="ml-2 text-muted-foreground">{fmtDate(i.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {inrPaise(i.total)}
                        {i.tax > 0 && <span className="text-xs text-muted-foreground"> (GST {inrPaise(i.tax)})</span>}
                      </span>
                      <Badge variant={i.status === "paid" ? "default" : "warning"}>{i.status === "paid" ? "Paid" : (i.status ?? "open")}</Badge>
                      {i.hostedInvoiceUrl && (
                        <a href={i.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                          View
                        </a>
                      )}
                      {i.pdfUrl && (
                        <a href={i.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline" aria-label={`Download PDF for ${i.number ?? "invoice"}`}>
                          <Download className="h-3.5 w-3.5" /> PDF
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Add your GSTIN at checkout or in “Manage billing” so it appears on your invoices.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const current = p.tier === data.plan.tier;
          return (
            <Card key={p.tier} className={cn(current && "border-primary ring-1 ring-primary/30")}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {p.name}
                  {current && <Badge>Current</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {p.priceInr === 0 ? "₹0" : inr(p.priceInr)}
                    <span className="text-sm font-normal text-muted-foreground"> / month + GST</span>
                  </p>
                  {p.introPriceInr !== null && (
                    <p className="text-xs text-primary">First month only {inr(p.introPriceInr)} + GST</p>
                  )}
                  {p.overageInrPerReply !== null && (
                    <p className="text-xs text-muted-foreground">Extra AI replies (optional): {inr(p.overageInrPerReply)} each</p>
                  )}
                </div>
                <ul className="space-y-1.5 text-sm">
                  {LIMIT_ROWS.map((r) => (
                    <li key={r.key} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      <span>{r.text(p.limits[r.key])}</span>
                    </li>
                  ))}
                </ul>
                {current ? (
                  <p className="text-xs text-muted-foreground">Your plan</p>
                ) : p.tier === "free" ? (
                  <p className="text-xs text-muted-foreground">Cancel your subscription in “Manage billing” to return to Free.</p>
                ) : (
                  <Button
                    className="w-full"
                    disabled={!canManage || !p.purchasable || checkout.isPending || Boolean(sub?.hasPaymentMethodOnFile)}
                    onClick={() => go((cb) => checkout.mutate(p.tier as "starter" | "growth" | "enterprise", cb))}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    {sub?.hasPaymentMethodOnFile ? "Change in Manage billing" : p.purchasable ? `Choose ${p.name}` : "Not available yet"}
                  </Button>
                )}
                {!current && p.renewalNeedsApproval && p.tier !== "free" && (
                  <p className="text-xs text-muted-foreground">
                    Indian card rules: each renewal above ₹15,000 asks you to approve the payment.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {data.gstNote} Payments are handled on the secure Stripe checkout page. Going over a limit never deletes anything; it only stops you adding more until you upgrade.{" "}
        <Link href="/settings" className="underline">
          Back to settings
        </Link>
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Plan & billing" description="Your plan, what you have used this month, and upgrades." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <BillingInner />
      </Suspense>
    </div>
  );
}
