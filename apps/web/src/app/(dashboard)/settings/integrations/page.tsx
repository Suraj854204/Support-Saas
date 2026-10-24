import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";

import { IntegrationsClient } from "./integrations-client";

export default function IntegrationsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect a Gmail inbox so incoming customer emails automatically become tickets."
      />
      <Suspense fallback={null}>
        <IntegrationsClient />
      </Suspense>
    </div>
  );
}
