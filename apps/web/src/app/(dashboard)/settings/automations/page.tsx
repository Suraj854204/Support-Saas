"use client";

import { PageHeader } from "@/components/shared/page-header";
import { AutomationRecipes } from "@/components/settings/automation-recipes";
import { AutomationRuleCard } from "@/components/settings/automation-rule-card";
import { AutomationRuleForm } from "@/components/settings/automation-rule-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutomationRules } from "@/hooks/use-automations";

export default function AutomationsPage() {
  const { data: rules, isLoading } = useAutomationRules();

  return (
    <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PageHeader
          title="Automation rules"
          description="Route, prioritize, tag, assign and reply automatically. Test any rule on a real ticket before switching it on."
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : !rules || rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Add a recipe or build your own.</p>
        ) : (
          rules.map((rule) => <AutomationRuleCard key={rule.id} rule={rule} />)
        )}
      </div>

      <div className="space-y-6">
        <AutomationRecipes />
        <AutomationRuleForm />
      </div>
    </div>
  );
}
