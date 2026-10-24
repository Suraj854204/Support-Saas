"use client";

import { ApiKeysCard } from "@/components/developers/api-keys-card";
import { ImportCard } from "@/components/developers/import-card";
import { ShopifyCard } from "@/components/developers/shopify-card";
import { WebhooksCard } from "@/components/developers/webhooks-card";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-auth";

export default function DevelopersPage() {
  const { data: user, isLoading } = useCurrentUser();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  if (!isLoading && !isAdmin) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Developers" description="Only owners and admins can manage API keys, webhooks and data connections." />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Developers" description="API keys, webhooks, order lookups and data import." />
      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>
        <TabsContent value="api-keys">
          <ApiKeysCard />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhooksCard />
        </TabsContent>
        <TabsContent value="shopify">
          <ShopifyCard />
        </TabsContent>
        <TabsContent value="import">
          <ImportCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
