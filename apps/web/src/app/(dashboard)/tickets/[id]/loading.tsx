import { Skeleton } from "@/components/ui/skeleton";

export default function TicketDetailLoading() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}
