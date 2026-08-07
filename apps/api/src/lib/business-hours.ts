import { fromZonedTime, toZonedTime } from "date-fns-tz";

export interface BusinessHoursConfig {
  timezone: string;
  /** 0 = Sunday ... 6 = Saturday, matching JS Date#getDay(). */
  workingDays: number[];
  /** Minutes since local midnight, e.g. 9:00am = 540. */
  startMinute: number;
  /** Minutes since local midnight, e.g. 5:00pm = 1020. */
  endMinute: number;
  /** ISO date strings (YYYY-MM-DD), local to `timezone`. */
  holidays: string[];
}

const MAX_DAY_ADVANCES = 400; // ~13 months of calendar days — a sane circuit breaker, not a real limit

function localDateKey(zoned: Date): string {
  // `zoned` here is a date-fns-tz "zoned" Date — its getters already read
  // as the local wall-clock time, so plain getters are correct.
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minuteOfDay(zoned: Date): number {
  return zoned.getHours() * 60 + zoned.getMinutes();
}

function isWorkingDay(zoned: Date, config: BusinessHoursConfig): boolean {
  return config.workingDays.includes(zoned.getDay()) && !config.holidays.includes(localDateKey(zoned));
}

function atMinute(zoned: Date, minute: number): Date {
  const next = new Date(zoned);
  next.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return next;
}

function startOfNextDay(zoned: Date): Date {
  const next = new Date(zoned);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function isValidBusinessHoursConfig(config: Partial<BusinessHoursConfig> | null | undefined): config is BusinessHoursConfig {
  return Boolean(
    config &&
      config.timezone &&
      Array.isArray(config.workingDays) &&
      config.workingDays.length > 0 &&
      typeof config.startMinute === "number" &&
      typeof config.endMinute === "number" &&
      config.endMinute > config.startMinute
  );
}

/**
 * Returns the UTC Date that is `minutesNeeded` of *working* time after
 * `fromUtc`, per `config`. Time outside working days/hours/holidays simply
 * doesn't count — a 4-hour SLA started at 4pm Friday (5pm cutoff) lands at
 * 3pm Monday, not 8pm Friday.
 */
export function addBusinessMinutes(fromUtc: Date, minutesNeeded: number, config: BusinessHoursConfig): Date {
  let cursor = toZonedTime(fromUtc, config.timezone);
  let remaining = minutesNeeded;
  let advances = 0;

  // Snap forward onto a working day/window before starting the countdown.
  while (
    (!isWorkingDay(cursor, config) || minuteOfDay(cursor) >= config.endMinute) &&
    advances < MAX_DAY_ADVANCES
  ) {
    cursor = atMinute(startOfNextDay(cursor), config.startMinute);
    advances++;
  }
  if (minuteOfDay(cursor) < config.startMinute) {
    cursor = atMinute(cursor, config.startMinute);
  }

  while (remaining > 0 && advances < MAX_DAY_ADVANCES) {
    const minutesAvailableToday = config.endMinute - minuteOfDay(cursor);

    if (remaining <= minutesAvailableToday) {
      cursor = new Date(cursor.getTime() + remaining * 60_000);
      remaining = 0;
      break;
    }

    remaining -= minutesAvailableToday;
    cursor = atMinute(startOfNextDay(cursor), config.startMinute);
    advances++;

    while (!isWorkingDay(cursor, config) && advances < MAX_DAY_ADVANCES) {
      cursor = atMinute(startOfNextDay(cursor), config.startMinute);
      advances++;
    }
  }

  return fromZonedTime(cursor, config.timezone);
}

/** Whether `atUtc` falls within a working window per `config`. Used for the "business_hours" automation condition. */
export function isWithinBusinessHours(atUtc: Date, config: BusinessHoursConfig): boolean {
  const zoned = toZonedTime(atUtc, config.timezone);
  return isWorkingDay(zoned, config) && minuteOfDay(zoned) >= config.startMinute && minuteOfDay(zoned) < config.endMinute;
}
