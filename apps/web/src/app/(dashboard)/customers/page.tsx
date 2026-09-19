"use client";

import { Star, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useCustomers } from "@/hooks/use-customers";
import { initials } from "@/lib/format";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useCustomers(search || undefined);

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has reached out, across every channel." />

      <div className="mb-4">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !customers || customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Customers appear here automatically as tickets come in, or you can add one manually."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/customers/${customer.id}`} className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">
                          {initials(customer.name ?? customer.email ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">
                          {customer.name ?? "Unnamed"}
                          {customer.isVip && <Star className="h-3 w-3 fill-warning text-warning" />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{customer.email ?? "No email"}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{customer.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="muted" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.isBlocked && <Badge variant="danger">Blocked</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
