import { Suspense } from "react";

import { TicketsPageClient } from "./tickets-page-client";

export default function TicketsPage() {
  return (
    <Suspense fallback={null}>
      <TicketsPageClient />
    </Suspense>
  );
}
