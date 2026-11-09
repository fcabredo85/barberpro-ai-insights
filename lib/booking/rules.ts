/**
 * Booking rules shown in the UI. The database (booking_window() and
 * book_appointment()) is the authority; keep these values in sync with
 * supabase/migrations/20261108030000_appointments.sql.
 */
export const BOOKING_TIME_ZONE = "Asia/Manila";
export const BOOKING_OPENS = "10:00";
export const BOOKING_CLOSES = "21:00";
export const BOOKING_MAX_DAYS_AHEAD = 60;

/** Allowed service durations in minutes (owner decision: 30 minutes to 1 hour). */
export const SERVICE_DURATIONS = [30, 45, 60] as const;
export type ServiceDuration = (typeof SERVICE_DURATIONS)[number];
export const DEFAULT_SERVICE_DURATION: ServiceDuration = 30;

export const APPOINTMENT_STATUSES = ["confirmed", "cancelled", "completed", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: BOOKING_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-PH", { timeZone: BOOKING_TIME_ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function formatSlotTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatAppointmentWhen(startsAt: string, endsAt: string): string {
  return `${dateFormat.format(new Date(startsAt))}, ${formatSlotTime(startsAt)} – ${formatSlotTime(endsAt)}`;
}

/** Validate a duration typed into the service form ("30", "45" or "60"). */
export function parseServiceDuration(value: unknown): ServiceDuration | null {
  const n = typeof value === "string" ? Number(value.trim()) : NaN;
  return (SERVICE_DURATIONS as readonly number[]).includes(n) ? (n as ServiceDuration) : null;
}
