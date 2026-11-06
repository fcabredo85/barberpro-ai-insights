/**
 * Asia/Manila reporting dates. The Philippines uses UTC+08:00 year-round
 * (no daylight saving), so day boundaries are a fixed offset from UTC.
 * Storage is always UTC timestamptz.
 */

export const REPORT_TIME_ZONE = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest date range a report may request. */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" as a calendar date; returns UTC ms of that date's midnight, or null. */
function parseCalendarDate(value: string): number | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  // Reject impossible dates such as 2026-02-30.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

export function isValidIsoDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

/** Today's calendar date in Manila, as "YYYY-MM-DD". */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shift a "YYYY-MM-DD" date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const ms = parseCalendarDate(isoDate);
  if (ms === null) throw new RangeError(`Invalid date: ${isoDate}`);
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

export interface UtcRange {
  /** Inclusive start, ISO UTC timestamp. */
  startUtc: string;
  /** Exclusive end, ISO UTC timestamp. */
  endUtc: string;
}

/**
 * Convert an inclusive Manila date range [from, to] into a UTC half-open
 * interval [start, end) for querying timestamptz columns.
 */
export function manilaDateRangeToUtc(from: string, to: string): UtcRange {
  const fromMs = parseCalendarDate(from);
  const toMs = parseCalendarDate(to);
  if (fromMs === null || toMs === null) throw new RangeError("Dates must be valid YYYY-MM-DD values");
  if (toMs < fromMs) throw new RangeError("End date must not be before start date");
  return {
    startUtc: new Date(fromMs - MANILA_OFFSET_MS).toISOString(),
    endUtc: new Date(toMs + DAY_MS - MANILA_OFFSET_MS).toISOString(),
  };
}

/** Number of calendar days in the inclusive range. */
export function rangeLengthDays(from: string, to: string): number {
  const fromMs = parseCalendarDate(from);
  const toMs = parseCalendarDate(to);
  if (fromMs === null || toMs === null) throw new RangeError("Invalid date");
  return Math.round((toMs - fromMs) / DAY_MS) + 1;
}

const manilaDateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const calendarShort = new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "short", day: "numeric" });
const calendarLong = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Label a Manila calendar date ("YYYY-MM-DD"), e.g. "Nov 6". The date is already Manila-local. */
export function formatCalendarDateShort(isoDate: string): string {
  const ms = parseCalendarDate(isoDate);
  return ms === null ? isoDate : calendarShort.format(new Date(ms));
}

/** e.g. "Fri, Nov 6, 2026". */
export function formatCalendarDateLong(isoDate: string): string {
  const ms = parseCalendarDate(isoDate);
  return ms === null ? isoDate : calendarLong.format(new Date(ms));
}

/** Display a stored UTC timestamp in Manila time, e.g. "Nov 6, 2026, 2:05 PM". */
export function formatManilaDateTime(isoTimestamp: string): string {
  return manilaDateTime.format(new Date(isoTimestamp));
}
