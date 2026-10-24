import { formatDistanceToNowStrict } from "date-fns";

export function relativeTime(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function ticketRef(number: number): string {
  return `#${number}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + (last ?? "")).toUpperCase();
}

/**
 * Percentage of SLA time remaining, 100 = just created, 0 = at/past the
 * breach deadline. Returns null when there's no SLA deadline set.
 */
export function slaPercentRemaining(createdAt: string, slaBreachAt: string | null): number | null {
  if (!slaBreachAt) return null;
  const created = new Date(createdAt).getTime();
  const breach = new Date(slaBreachAt).getTime();
  const now = Date.now();
  if (breach <= created) return 0;
  const pct = ((breach - now) / (breach - created)) * 100;
  return Math.max(0, Math.min(100, pct));
}


/** "Due in 5h 12m" or "Overdue by 3h 5m". Pure so it is easy to read and test. */
export function timeLeftLabel(due: string, now: number): { text: string; overdue: boolean } {
  const ms = new Date(due).getTime() - now;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? { text: `Overdue by ${span}`, overdue: true } : { text: `Due in ${span}`, overdue: false };
}
