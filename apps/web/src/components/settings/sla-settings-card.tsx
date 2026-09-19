"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCurrentOrg, useUpdateOrg } from "@/hooks/use-org";
import { useOrgUsers } from "@/hooks/use-users";
import { ApiRequestError } from "@/lib/api-client";
import type { Organization, TicketPriority } from "@support-saas/shared-types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITIES: TicketPriority[] = ["urgent", "high", "normal", "low"];

const DEFAULT_BUSINESS_HOURS: NonNullable<Organization["businessHours"]> = {
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  holidays: [],
};

const DEFAULT_SLA_POLICY: NonNullable<Organization["slaPolicy"]> = {
  firstResponseMinutes: { urgent: 60, high: 240, normal: 1440, low: 2880 },
  resolutionMinutes: { urgent: 240, high: 960, normal: 5760, low: 11520 },
  escalationEnabled: false,
  escalateAfterMinutes: 60,
  escalateToUserId: null,
};

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function SlaSettingsCard() {
  const { data: org } = useCurrentOrg();
  const updateOrg = useUpdateOrg();
  const { data: users } = useOrgUsers();

  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(false);
  const [businessHours, setBusinessHours] = useState(DEFAULT_BUSINESS_HOURS);
  const [slaPolicy, setSlaPolicy] = useState(DEFAULT_SLA_POLICY);

  useEffect(() => {
    if (org?.businessHours) {
      setBusinessHoursEnabled(true);
      setBusinessHours(org.businessHours);
    }
    if (org?.slaPolicy) setSlaPolicy(org.slaPolicy);
  }, [org]);

  const onSave = () => {
    updateOrg.mutate(
      {
        businessHours: businessHoursEnabled ? businessHours : null,
        slaPolicy,
      },
      {
        onSuccess: () => toast.success("SLA settings saved"),
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't save SLA settings."),
      }
    );
  };

  const toggleDay = (day: number) => {
    setBusinessHours((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort(),
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">SLA &amp; business hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Use business hours for SLA calculation</p>
            <p className="text-xs text-muted-foreground">
              Off: SLA deadlines count elapsed time, 24/7. On: only working hours count.
            </p>
          </div>
          <Switch checked={businessHoursEnabled} onCheckedChange={setBusinessHoursEnabled} />
        </div>

        {businessHoursEnabled && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Timezone (IANA name)</Label>
              <Input
                value={businessHours.timezone}
                placeholder="America/New_York"
                onChange={(e) => setBusinessHours((prev) => ({ ...prev, timezone: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Working days</Label>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={businessHours.workingDays.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start time</Label>
                <Input
                  type="time"
                  value={minutesToTime(businessHours.startMinute)}
                  onChange={(e) =>
                    setBusinessHours((prev) => ({ ...prev, startMinute: timeToMinutes(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End time</Label>
                <Input
                  type="time"
                  value={minutesToTime(businessHours.endMinute)}
                  onChange={(e) =>
                    setBusinessHours((prev) => ({ ...prev, endMinute: timeToMinutes(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs">First-response SLA (minutes, by priority)</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <div key={p} className="space-y-1">
                <Label className="text-[10px] capitalize text-muted-foreground">{p}</Label>
                <Input
                  type="number"
                  value={slaPolicy.firstResponseMinutes[p]}
                  onChange={(e) =>
                    setSlaPolicy((prev) => ({
                      ...prev,
                      firstResponseMinutes: { ...prev.firstResponseMinutes, [p]: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Resolution SLA (minutes, by priority)</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <div key={p} className="space-y-1">
                <Label className="text-[10px] capitalize text-muted-foreground">{p}</Label>
                <Input
                  type="number"
                  value={slaPolicy.resolutionMinutes[p]}
                  onChange={(e) =>
                    setSlaPolicy((prev) => ({
                      ...prev,
                      resolutionMinutes: { ...prev.resolutionMinutes, [p]: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Escalate breached tickets</span>
            <Switch
              checked={slaPolicy.escalationEnabled}
              onCheckedChange={(checked) => setSlaPolicy((prev) => ({ ...prev, escalationEnabled: checked }))}
            />
          </div>
          {slaPolicy.escalationEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">After (minutes past breach)</Label>
                <Input
                  type="number"
                  value={slaPolicy.escalateAfterMinutes}
                  onChange={(e) =>
                    setSlaPolicy((prev) => ({ ...prev, escalateAfterMinutes: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reassign to</Label>
                <Select
                  value={slaPolicy.escalateToUserId ?? "none"}
                  onValueChange={(v) =>
                    setSlaPolicy((prev) => ({ ...prev, escalateToUserId: v === "none" ? null : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't reassign</SelectItem>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <Button size="sm" onClick={onSave} disabled={updateOrg.isPending}>
          {updateOrg.isPending ? "Saving..." : "Save SLA settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
