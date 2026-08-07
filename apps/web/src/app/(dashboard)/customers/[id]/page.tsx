"use client";

import { Download, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/tickets/status-badge";
import {
  useCustomer,
  useCustomers,
  useDeleteCustomer,
  useExportCustomer,
  useMergeCustomer,
  useUpdateCustomer,
} from "@/hooks/use-customers";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime, ticketRef } from "@/lib/format";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: customer, isLoading } = useCustomer(params.id);
  const updateCustomer = useUpdateCustomer();
  const mergeCustomer = useMergeCustomer();
  const exportCustomer = useExportCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const { data: mergeCandidates } = useCustomers(mergeQuery || undefined);

  if (isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const onExport = () => {
    exportCustomer.mutate(customer.id, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `customer-${customer.id}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Export failed."),
    });
  };

  const onDelete = () => {
    if (
      !window.confirm(
        `Delete ${customer.name ?? customer.email ?? "this customer"}? Their name, email, and phone will be permanently removed. Ticket history is kept for your records but no longer linked to their identity. This can't be undone.`
      )
    ) {
      return;
    }
    deleteCustomer.mutate(customer.id, {
      onSuccess: () => {
        toast.success("Customer deleted");
        router.push("/customers");
      },
      onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't delete customer."),
    });
  };

  const onMerge = () => {
    if (!mergeTargetId) return;
    if (
      !window.confirm(
        "Merge this customer into the selected one? All of this customer's tickets will move to the target, and this record will be deleted. This can't be undone."
      )
    ) {
      return;
    }
    mergeCustomer.mutate(
      { id: customer.id, targetCustomerId: mergeTargetId },
      {
        onSuccess: () => {
          toast.success("Customers merged");
          router.push(`/customers/${mergeTargetId}`);
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Merge failed."),
      }
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <PageHeader
          title={customer.name ?? "Unnamed customer"}
          description={customer.email ?? "No email on file"}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ticket history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              customer.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="font-mono text-xs text-muted-foreground">{ticketRef(t.number)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-muted-foreground">{relativeTime(t.updatedAt)}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Total tickets</p>
              <p className="text-lg font-semibold">{customer.stats.totalTickets}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open tickets</p>
              <p className="text-lg font-semibold">{customer.stats.openTickets}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Last interaction</p>
              <p className="text-sm">{relativeTime(customer.stats.lastInteraction)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                defaultValue={customer.phone ?? ""}
                placeholder="Add a phone number"
                onBlur={(e) => {
                  if (e.target.value !== (customer.phone ?? "")) {
                    updateCustomer.mutate({ id: customer.id, phone: e.target.value || null });
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <Star className="h-3.5 w-3.5 text-warning" /> VIP
              </span>
              <Switch
                checked={customer.isVip}
                onCheckedChange={(checked) => updateCustomer.mutate({ id: customer.id, isVip: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Blocked</span>
              <Switch
                checked={customer.isBlocked}
                onCheckedChange={(checked) => updateCustomer.mutate({ id: customer.id, isBlocked: checked })}
              />
            </div>
            {customer.isBlocked && (
              <p className="text-xs text-muted-foreground">
                New emails from this customer will no longer create tickets.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Merge duplicate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Search for the customer to merge into..."
              value={mergeQuery}
              onChange={(e) => {
                setMergeQuery(e.target.value);
                setMergeTargetId(null);
              }}
            />
            {mergeQuery && mergeCandidates && (
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {mergeCandidates
                  .filter((c) => c.id !== customer.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setMergeTargetId(c.id)}
                      className={`w-full rounded-md border p-1.5 text-left text-xs ${
                        mergeTargetId === c.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      {c.name ?? "Unnamed"} — {c.email ?? "no email"}
                    </button>
                  ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!mergeTargetId || mergeCustomer.isPending}
              onClick={onMerge}
            >
              Merge into selected
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export customer data
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-danger hover:text-danger"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete customer
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
