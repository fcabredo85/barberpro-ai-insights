import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { addDays, manilaToday } from "@/lib/business/dates";
import { bookAppointment, changeAppointmentStatus, getAvailableSlots, listAppointmentsForDay } from "@/lib/db/appointments";
import { createBarber, createService, listServices, updateService } from "@/lib/db/catalog";
import type { BookAppointmentInput } from "@/lib/validation/appointments";

import { createOwnerWithShop, type TestClient } from "./supabase-test-env";

const TOMORROW = addDays(manilaToday(), 1);
/** A Manila wall-clock time on a date, as an ISO timestamp with offset. */
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+08:00`;
const iso = (date: string, hhmm: string) => new Date(at(date, hhmm)).toISOString();

async function shopWithCatalog(label: string, durationMinutes = 60) {
  const owner = await createOwnerWithShop(label);
  const barber = await createBarber(owner.client, owner.shop.id, { name: "Paolo", commissionRateBp: 4000 });
  const barber2 = await createBarber(owner.client, owner.shop.id, { name: "Migs", commissionRateBp: 3500 });
  const service = await createService(owner.client, owner.shop.id, { name: "Haircut", priceCentavos: 25_000, durationMinutes });
  if (!barber.ok || !barber2.ok || !service.ok) throw new Error("catalog setup failed");
  return { ...owner, barberId: barber.id, barber2Id: barber2.id, serviceId: service.id };
}

function booking(s: { barberId: string; serviceId: string }, startsAt: string, extra: Partial<BookAppointmentInput> = {}): BookAppointmentInput {
  return {
    barberId: s.barberId,
    serviceId: s.serviceId,
    startsAt,
    customerName: "Juan",
    customerPhone: undefined,
    notes: undefined,
    requestKey: randomUUID(),
    ...extra,
  };
}

async function book(client: TestClient, shopId: string, input: BookAppointmentInput) {
  return bookAppointment(client, shopId, input);
}

/**
 * Fires bookings for the same barber at once. A raw database error (as opposed
 * to a structured { ok: false } result) fails the test WITH its Postgres error
 * code, e.g. 40P01, so an intermittent CI failure is diagnosable from the log.
 */
async function bookConcurrently(
  s: { client: TestClient; shop: { id: string }; barberId: string; serviceId: string },
  times: string[],
) {
  const settled = await Promise.allSettled(times.map((t) => book(s.client, s.shop.id, booking(s, at(TOMORROW, t)))));
  const errors = settled.flatMap((r) =>
    r.status === "rejected" ? [`${(r.reason as Error).message} (code: ${String((r.reason as Error).cause)})`] : [],
  );
  expect(errors).toEqual([]);
  return settled.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof book>>>).value);
}

describe("service duration", () => {
  it("defaults to 30 minutes and accepts 45 or 60", async () => {
    const owner = await createOwnerWithShop("appt-duration");
    const plain = await createService(owner.client, owner.shop.id, { name: "Trim", priceCentavos: 10_000 });
    expect(plain.ok).toBe(true);
    if (plain.ok) expect((await updateService(owner.client, owner.shop.id, plain.id, { durationMinutes: 45 })).ok).toBe(true);
    const bad = await createService(owner.client, owner.shop.id, { name: "Odd", priceCentavos: 10_000, durationMinutes: 50 });
    expect(bad).toEqual({ ok: false, reason: "invalid" });
    expect((await listServices(owner.client, owner.shop.id)).map((s) => s.durationMinutes)).toEqual([45]);
  });
});

describe("availability", () => {
  it("offers 15-minute starts from 10:00 until the service fits before 21:00", async () => {
    const s = await shopWithCatalog("appt-slots", 60);
    const slots = await getAvailableSlots(s.client, s.shop.id, s.barberId, s.serviceId, TOMORROW);
    expect(slots[0]).toBe(iso(TOMORROW, "10:00"));
    expect(slots.at(-1)).toBe(iso(TOMORROW, "20:00"));
    expect(slots).toHaveLength(41);
  });

  it("removes times that overlap an existing booking, for that barber only", async () => {
    const s = await shopWithCatalog("appt-overlap-slots", 60);
    expect((await book(s.client, s.shop.id, booking(s, at(TOMORROW, "11:00")))).ok).toBe(true);
    const slots = await getAvailableSlots(s.client, s.shop.id, s.barberId, s.serviceId, TOMORROW);
    for (const t of ["10:15", "10:30", "10:45", "11:00", "11:45"]) expect(slots).not.toContain(iso(TOMORROW, t));
    for (const t of ["10:00", "12:00"]) expect(slots).toContain(iso(TOMORROW, t));
    const other = await getAvailableSlots(s.client, s.shop.id, s.barber2Id, s.serviceId, TOMORROW);
    expect(other).toContain(iso(TOMORROW, "11:00"));
  });

  it("returns nothing more than 60 days ahead", async () => {
    const s = await shopWithCatalog("appt-far");
    expect(await getAvailableSlots(s.client, s.shop.id, s.barberId, s.serviceId, addDays(manilaToday(), 61))).toEqual([]);
  });
});

describe("book_appointment rules", () => {
  it("creates a confirmed appointment with an end time from the service duration", async () => {
    const s = await shopWithCatalog("appt-book", 45);
    const result = await book(s.client, s.shop.id, booking(s, at(TOMORROW, "10:00"), { customerPhone: "0917 123 4567", styleId: "low-taper-fade" }));
    expect(result).toMatchObject({ ok: true, duplicate: false, status: "confirmed" });
    if (!result.ok) return;
    expect(new Date(result.endsAt).toISOString()).toBe(iso(TOMORROW, "10:45"));
    const [listed] = await listAppointmentsForDay(s.client, s.shop.id, TOMORROW);
    expect(listed).toMatchObject({ id: result.appointmentId, status: "confirmed", barberName: "Paolo", serviceName: "Haircut", styleName: "Low Taper Fade" });
  });

  it("never double-books a barber", async () => {
    const s = await shopWithCatalog("appt-double", 60);
    expect((await book(s.client, s.shop.id, booking(s, at(TOMORROW, "14:00")))).ok).toBe(true);
    expect(await book(s.client, s.shop.id, booking(s, at(TOMORROW, "14:30")))).toEqual({ ok: false, reason: "slot_taken" });
    expect(await book(s.client, s.shop.id, booking(s, at(TOMORROW, "13:15")))).toEqual({ ok: false, reason: "slot_taken" });
    // Back-to-back is fine, and another barber can take the same time.
    expect((await book(s.client, s.shop.id, booking(s, at(TOMORROW, "15:00")))).ok).toBe(true);
    expect((await book(s.client, s.shop.id, { ...booking(s, at(TOMORROW, "14:00")), barberId: s.barber2Id })).ok).toBe(true);
  });

  it("allows only one of two simultaneous bookings for the same time", async () => {
    const s = await shopWithCatalog("appt-race", 60);
    const results = await bookConcurrently(s, ["16:00", "16:00"]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "slot_taken" }]);
  });

  it("handles many simultaneous overlapping bookings cleanly (one wins, the rest get slot_taken)", async () => {
    const s = await shopWithCatalog("appt-race-many", 60);
    // Same barber, overlapping (not identical) start times, all fired at once.
    const times = ["13:00", "13:00", "13:15", "13:30", "12:15", "13:45"];
    const results = await bookConcurrently(s, times);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual(Array(times.length - 1).fill({ ok: false, reason: "slot_taken" }));
  });

  it.each([
    ["before opening", "09:45", "outside_hours"],
    ["ending after closing", "20:15", "outside_hours"],
    ["off the 15-minute grid", "10:05", "not_on_slot"],
  ])("rejects a time %s", async (_label, time, reason) => {
    const s = await shopWithCatalog(`appt-hours-${time.replace(":", "")}`, 60);
    expect(await book(s.client, s.shop.id, booking(s, at(TOMORROW, time)))).toEqual({ ok: false, reason });
  });

  it("accepts the last slot that ends exactly at closing", async () => {
    const s = await shopWithCatalog("appt-last", 60);
    expect((await book(s.client, s.shop.id, booking(s, at(TOMORROW, "20:00")))).ok).toBe(true);
  });

  it("rejects past times and dates too far ahead", async () => {
    const s = await shopWithCatalog("appt-when");
    expect(await book(s.client, s.shop.id, booking(s, at(addDays(manilaToday(), -1), "12:00")))).toEqual({ ok: false, reason: "in_past" });
    expect(await book(s.client, s.shop.id, booking(s, at(addDays(manilaToday(), 61), "12:00")))).toEqual({ ok: false, reason: "too_far_ahead" });
  });

  it("is idempotent per request key", async () => {
    const s = await shopWithCatalog("appt-idem");
    const input = booking(s, at(TOMORROW, "12:00"));
    const first = await book(s.client, s.shop.id, input);
    const again = await book(s.client, s.shop.id, input);
    expect(first.ok && again.ok && again.duplicate && again.appointmentId === first.appointmentId).toBe(true);
    expect(await listAppointmentsForDay(s.client, s.shop.id, TOMORROW)).toHaveLength(1);
  });

  it("rejects inactive services, unknown barbers and saved looks from elsewhere", async () => {
    const s = await shopWithCatalog("appt-invalid");
    await updateService(s.client, s.shop.id, s.serviceId, { active: false });
    expect(await book(s.client, s.shop.id, booking(s, at(TOMORROW, "12:00")))).toEqual({ ok: false, reason: "invalid_service" });
    await updateService(s.client, s.shop.id, s.serviceId, { active: true });
    expect(await book(s.client, s.shop.id, { ...booking(s, at(TOMORROW, "12:00")), barberId: randomUUID() })).toEqual({ ok: false, reason: "invalid_barber" });
    expect(await book(s.client, s.shop.id, booking(s, at(TOMORROW, "12:00"), { savedLookId: randomUUID() }))).toEqual({ ok: false, reason: "invalid_look" });
  });
});

describe("appointment status changes", () => {
  it("cancelling frees the time for a new booking", async () => {
    const s = await shopWithCatalog("appt-cancel");
    const first = await book(s.client, s.shop.id, booking(s, at(TOMORROW, "17:00")));
    if (!first.ok) throw new Error("booking failed");
    expect(await changeAppointmentStatus(s.client, first.appointmentId, { action: "cancel" })).toEqual({ ok: true, status: "cancelled" });
    expect((await book(s.client, s.shop.id, booking(s, at(TOMORROW, "17:00")))).ok).toBe(true);
    // A cancelled appointment can't be changed again.
    expect(await changeAppointmentStatus(s.client, first.appointmentId, { action: "cancel" })).toMatchObject({ ok: false, reason: "not_confirmed" });
  });

  it("won't complete or mark no-show before the appointment time, and records no sale", async () => {
    const s = await shopWithCatalog("appt-early");
    const appt = await book(s.client, s.shop.id, booking(s, at(TOMORROW, "18:00")));
    if (!appt.ok) throw new Error("booking failed");
    expect(await changeAppointmentStatus(s.client, appt.appointmentId, { action: "complete", paymentMethod: "cash" })).toEqual({ ok: false, reason: "too_early" });
    expect(await changeAppointmentStatus(s.client, appt.appointmentId, { action: "no_show" })).toEqual({ ok: false, reason: "too_early" });
    expect((await s.client.from("sales").select("id")).data).toEqual([]);
  });
});

describe("appointments: access control (FR-16)", () => {
  it("another barbershop can't book into, read or change this shop's appointments", async () => {
    const victim = await shopWithCatalog("appt-victim");
    const intruder = await createOwnerWithShop("appt-intruder");
    const appt = await book(victim.client, victim.shop.id, booking(victim, at(TOMORROW, "13:00")));
    if (!appt.ok) throw new Error("booking failed");

    await expect(book(intruder.client, victim.shop.id, booking(victim, at(TOMORROW, "15:00")))).rejects.toThrow();
    await expect(getAvailableSlots(intruder.client, victim.shop.id, victim.barberId, victim.serviceId, TOMORROW)).rejects.toThrow();
    expect(await listAppointmentsForDay(intruder.client, victim.shop.id, TOMORROW)).toEqual([]);
    expect(await changeAppointmentStatus(intruder.client, appt.appointmentId, { action: "cancel" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("blocks direct writes to appointments", async () => {
    const s = await shopWithCatalog("appt-direct");
    const appt = await book(s.client, s.shop.id, booking(s, at(TOMORROW, "13:00")));
    if (!appt.ok) throw new Error("booking failed");
    const upd = await s.client.from("appointments").update({ status: "completed" }).eq("id", appt.appointmentId);
    expect(upd.error?.code).toBe("42501");
  });
});
