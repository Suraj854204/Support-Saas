"use client";

import { EvalPanel } from "@/components/ai-insights/eval-panel";
import { TracesPanel } from "@/components/ai-insights/traces-panel";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-auth";

export default function AiInsightsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  if (!isLoading && !isAdmin) {
    return (
      <div className="max-w-4xl">
        <PageHeader title="AI insights" description="Only owners and admins can review AI answers and run quality tests." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="AI insights" description="See why the AI answered the way it did, how agents rate it, and test it after every knowledge-base change." />
      <Tabs defaultValue="traces">
        <TabsList>
          <TabsTrigger value="traces">Answers</TabsTrigger>
          <TabsTrigger value="tests">Quality tests</TabsTrigger>
        </TabsList>
        <TabsContent value="traces">
          <TracesPanel />
        </TabsContent>
        <TabsContent value="tests">
          <EvalPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
