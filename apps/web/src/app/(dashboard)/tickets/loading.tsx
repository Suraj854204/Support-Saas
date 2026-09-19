import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { TicketsTableSkeleton } from "@/components/tickets/tickets-table-skeleton";

export default function TicketsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-6 w-24" />
      <Skeleton className="mb-6 h-4 w-96" />
      <Skeleton className="mb-4 h-9 w-full" />
      <Card className="overflow-hidden">
        <TicketsTableSkeleton />
      </Card>
    </div>
  );
}
