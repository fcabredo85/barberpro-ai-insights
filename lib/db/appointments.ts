import "server-only";

import { z } from "zod";

import { manilaDateRangeToUtc } from "@/lib/business/dates";
import type { AppointmentStatus } from "@/lib/booking/rules";
import type { DbClient } from "@/lib/db/types";
import { getHairstyle, isHairstyleId } from "@/lib/tryon/styles";
import type { AppointmentAction, BookAppointmentInput } from "@/lib/validation/appointments";

export interface AppointmentView {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  customerName: string;
  customerPhone: string | null;
  notes: string | null;
  barberName: string;
  serviceName: string;
  styleName: string | null;
  savedLookId: string | null;
  saleId: string | null;
  /** Start time has passed (evaluated when loaded). */
  started: boolean;
}

/** Free start times (ISO UTC strings) for a barber and service on a Manila date. */
export async function getAvailableSlots(db: DbClient, barbershopId: string, barberId: string, serviceId: string, date: string): Promise<string[]> {
  const { data, error } = await db.rpc("appointment_slots", {
    p_barbershop_id: barbershopId,
    p_barber_id: barberId,
    p_service_id: serviceId,
    p_day: date,
  });
  if (error) throw new Error("Failed to load available times", { cause: error.code });
  const parsed = z.array(z.string()).safeParse(data);
  if (!parsed.success) throw new Error("Available times had an unexpected shape");
  return parsed.data.map((slot) => new Date(slot).toISOString());
}

const bookResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    duplicate: z.boolean(),
    appointmentId: z.uuid(),
    status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
    startsAt: z.string(),
    endsAt: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      "invalid_barber",
      "invalid_service",
      "invalid_look",
      "in_past",
      "too_far_ahead",
      "not_on_slot",
      "outside_hours",
      "slot_taken",
      "invalid_details",
    ]),
  }),
]);

export type BookResult = z.infer<typeof bookResultSchema>;

/** Book a CONFIRMED appointment; every rule is checked in the database. */
export async function bookAppointment(db: DbClient, barbershopId: string, input: BookAppointmentInput): Promise<BookResult> {
  const { data, error } = await db.rpc("book_appointment", {
    p_barbershop_id: barbershopId,
    p_barber_id: input.barberId,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone ?? "",
    p_notes: input.notes ?? "",
    // The generated types mark these as required strings; null is valid SQL here.
    p_saved_look_id: (input.savedLookId ?? null) as unknown as string,
    p_style_id: (input.styleId ?? null) as unknown as string,
    p_request_key: input.requestKey,
  });
  if (error) throw new Error("Failed to book appointment", { cause: error.code });
  const parsed = bookResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("Booking response had an unexpected shape");
  return parsed.data;
}

const statusResultSchema = z.union([
  z.object({ ok: z.literal(true), status: z.enum(["cancelled", "completed", "no_show"]), saleId: z.uuid().optional() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["not_found", "not_confirmed", "too_early", "payment_method_required", "catalog_inactive"]),
    status: z.string().optional(),
  }),
]);

export type StatusResult = z.infer<typeof statusResultSchema>;

const ACTION_STATUS = { cancel: "cancelled", no_show: "no_show", complete: "completed" } as const;

/** Cancel, mark no-show, or complete (which records the sale atomically). */
export async function changeAppointmentStatus(db: DbClient, appointmentId: string, action: AppointmentAction): Promise<StatusResult> {
  const { data, error } = await db.rpc("set_appointment_status", {
    p_appointment_id: appointmentId,
    p_status: ACTION_STATUS[action.action],
    ...(action.action === "complete" && { p_payment_method: action.paymentMethod }),
  });
  if (error) throw new Error("Failed to update appointment", { cause: error.code });
  const parsed = statusResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("Appointment update had an unexpected shape");
  return parsed.data;
}

const APPOINTMENT_COLUMNS =
  "id, starts_at, ends_at, status, customer_name, customer_phone, notes, style_id, saved_look_id, sale_id, barbers ( name ), services ( name )" as const;

/** The shop's appointments on one Manila calendar date, in start order. */
export async function listAppointmentsForDay(db: DbClient, barbershopId: string, date: string): Promise<AppointmentView[]> {
  const { startUtc, endUtc } = manilaDateRangeToUtc(date, date);
  const { data, error } = await db
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("barbershop_id", barbershopId)
    .gte("starts_at", startUtc)
    .lt("starts_at", endUtc)
    .order("starts_at", { ascending: true });
  if (error) throw new Error("Failed to load appointments", { cause: error.code });
  const now = Date.now();
  return data.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    notes: row.notes,
    barberName: row.barbers?.name ?? "Unknown barber",
    serviceName: row.services?.name ?? "Unknown service",
    styleName: row.style_id && isHairstyleId(row.style_id) ? getHairstyle(row.style_id).name : null,
    savedLookId: row.saved_look_id,
    saleId: row.sale_id,
    started: Date.parse(row.starts_at) <= now,
  }));
}
