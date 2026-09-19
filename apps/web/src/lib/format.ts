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

