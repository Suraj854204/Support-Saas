import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

export type AutomationTrigger =
  | "ticket_created"
  | "customer_replied"
  | "status_changed"
  | "sla_approaching"
  | "sla_breached"
  | "ticket_inactive"
  | "ticket_reopened";

export type ConditionField =
  | "subject"
  | "message_text"
  | "customer_tags"
  | "channel"
  | "priority"
  | "status"
  | "team"
  | "business_hours";

export type ConditionOperator = "contains" | "equals" | "not_equals" | "in";
export type ActionType = "set_priority" | "assign_team" | "add_tag" | "send_email";

export interface AutomationCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

export interface AutomationAction {
  type: ActionType;
  value: string;
}

export interface AutomationRule {
  id: string;
  orgId: string;
  name: string;
  trigger: AutomationTrigger;
  isActive: boolean;
  position: number;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  triggerConfig: Record<string, string | number>;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunLog {
  id: string;
  ruleId: string;
  ticketId: string | null;
  actionsApplied: Record<string, unknown>;
  createdAt: string;
}

export function useAutomationRules() {
  return useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => apiClient.get<AutomationRule[]>("/api/automations"),
  });
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AutomationRule, "id" | "orgId" | "createdById" | "createdAt" | "updatedAt">) =>
      apiClient.post<AutomationRule>("/api/automations", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });
}

export function useUpdateAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<AutomationRule>) =>
      apiClient.patch<AutomationRule>(`/api/automations/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/automations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });
}

export function useAutomationRunLogs(ruleId: string | undefined) {
  return useQuery({
    queryKey: ["automation-rules", ruleId, "run-logs"],
    queryFn: () => apiClient.get<AutomationRunLog[]>(`/api/automations/${ruleId}/run-logs`),
    enabled: Boolean(ruleId),
  });
}
