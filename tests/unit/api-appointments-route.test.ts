// @vitest-environment node
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServiceDuration } from "@/lib/booking/rules";
import { appointmentActionSchema, bookAppointmentSchema } from "@/lib/validation/appointments";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  bookAppointment: vi.fn(),
  changeAppointmentStatus: vi.fn(),
  getAvailableSlots: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/db/appointments", () => ({
  bookAppointment: mocks.bookAppointment,
  changeAppointmentStatus: mocks.changeAppointmentStatus,
  getAvailableSlots: mocks.getAvailableSlots,
}));

import { PATCH } from "@/app/api/appointments/[id]/route";
import { GET as AVAILABILITY } from "@/app/api/appointments/availability/route";
import { POST } from "@/app/api/appointments/route";

const SHOP_ID = randomUUID();
const APPT_ID = randomUUID();

const validBooking = () => ({
  barberId: randomUUID(),
  serviceId: randomUUID(),
  startsAt: "2026-11-20T10:00:00+08:00",
  customerName: "Juan",
  requestKey: randomUUID(),
});

const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const post = (body: unknown) => POST(json("http://localhost/api/appointments", "POST", body));
const patch = (id: string, body: unknown) => PATCH(json(`http://localhost/api/appointments/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: SHOP_ID, name: "Shop", role: "manager" });
});

describe("POST /api/appointments", () => {
  it("returns 401/403 before booking anything", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await post(validBooking())).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    expect((await post(validBooking())).status).toBe(403);
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
  });

  it("books for the caller's own shop and returns 201 with Confirmed status", async () => {
    mocks.bookAppointment.mockResolvedValue({
      ok: true,
      duplicate: false,
      appointmentId: APPT_ID,
      status: "confirmed",
      startsAt: "2026-11-20T02:00:00Z",
      endsAt: "2026-11-20T03:00:00Z",
    });
    const input = validBooking();
    const res = await post(input);
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({
      appointmentId: APPT_ID,
      status: "confirmed",
      startsAt: "2026-11-20T02:00:00Z",
      endsAt: "2026-11-20T03:00:00Z",
      duplicate: false,
    });
    expect(mocks.bookAppointment).toHaveBeenCalledWith(expect.anything(), SHOP_ID, expect.objectContaining({ customerName: "Juan" }));
  });

  it("returns 200 for a replayed request key", async () => {
    mocks.bookAppointment.mockResolvedValue({ ok: true, duplicate: true, appointmentId: APPT_ID, status: "confirmed", startsAt: "a", endsAt: "b" });
    expect((await post(validBooking())).status).toBe(200);
  });

  it("returns 409 when the time was just taken, never a confirmation", async () => {
    mocks.bookAppointment.mockResolvedValue({ ok: false, reason: "slot_taken" });
    const res = await post(validBooking());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.data).toBeUndefined();
    expect(body.error.fields.startsAt).toMatch(/just booked/);
  });

  it.each([
    ["outside_hours", /10:00 AM to 9:00 PM/],
    ["in_past", /already passed/],
    ["invalid_service", /service/],
  ] as const)("explains %s with a 400", async (reason, message) => {
    mocks.bookAppointment.mockResolvedValue({ ok: false, reason });
    const res = await post(validBooking());
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(message);
  });

  it.each([
    ["a client-supplied price", { price: 1 }],
    ["a client-supplied end time", { endsAt: "2026-11-20T12:00:00+08:00" }],
    ["a barbershop id", { barbershopId: randomUUID() }],
    ["a bad phone number", { customerPhone: "call me maybe" }],
    ["a missing name", { customerName: " " }],
    ["a non-ISO time", { startsAt: "tomorrow 10am" }],
  ])("rejects %s without booking", async (_label, extra) => {
    const res = await post({ ...validBooking(), ...extra });
    expect(res.status).toBe(400);
    expect(mocks.bookAppointment).not.toHaveBeenCalled();
  });

  it("returns a safe 500 that says nothing was booked", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.bookAppointment.mockRejectedValue(new Error("db at 10.1.2.3 down"));
    const res = await post(validBooking());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("10.1.2.3");
    expect(text).toMatch(/Nothing was booked/);
    spy.mockRestore();
  });
});

describe("PATCH /api/appointments/:id", () => {
  it("completes with a payment method and returns the sale id", async () => {
    const saleId = randomUUID();
    mocks.changeAppointmentStatus.mockResolvedValue({ ok: true, status: "completed", saleId });
    const res = await patch(APPT_ID, { action: "complete", paymentMethod: "gcash" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ status: "completed", saleId });
    expect(mocks.changeAppointmentStatus).toHaveBeenCalledWith(expect.anything(), APPT_ID, { action: "complete", paymentMethod: "gcash" });
  });

  it("requires a payment method to complete", async () => {
    expect((await patch(APPT_ID, { action: "complete" })).status).toBe(400);
    expect(mocks.changeAppointmentStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["not_confirmed", 409],
    ["too_early", 400],
    ["catalog_inactive", 409],
  ] as const)("maps %s to %i", async (reason, status) => {
    mocks.changeAppointmentStatus.mockResolvedValue({ ok: false, reason });
    expect((await patch(APPT_ID, { action: "cancel" })).status).toBe(status);
  });

  it("rejects malformed ids and unknown actions", async () => {
    expect((await patch("nope", { action: "cancel" })).status).toBe(400);
    expect((await patch(APPT_ID, { action: "delete" })).status).toBe(400);
    expect((await patch(APPT_ID, { action: "cancel", status: "completed" })).status).toBe(400);
  });
});

describe("GET /api/appointments/availability", () => {
  const url = (q: string) => new Request(`http://localhost/api/appointments/availability?${q}`);

  it("returns free slots for the caller's shop", async () => {
    mocks.getAvailableSlots.mockResolvedValue(["2026-11-20T02:00:00.000Z"]);
    const barberId = randomUUID();
    const serviceId = randomUUID();
    const res = await AVAILABILITY(url(`barberId=${barberId}&serviceId=${serviceId}&date=2026-11-20`));
    expect(res.status).toBe(200);
    expect((await res.json()).data.slots).toEqual(["2026-11-20T02:00:00.000Z"]);
    expect(mocks.getAvailableSlots).toHaveBeenCalledWith(expect.anything(), SHOP_ID, barberId, serviceId, "2026-11-20");
  });

  it("validates the query", async () => {
    expect((await AVAILABILITY(url(`barberId=x&serviceId=y&date=2026-02-30`))).status).toBe(400);
  });
});

describe("validation and rules", () => {
  it("accepts only 30, 45 or 60-minute durations", () => {
    expect(["30", "45", "60", " 45 "].map(parseServiceDuration)).toEqual([30, 45, 60, 45]);
    expect(["15", "50", "90", "", "abc"].map(parseServiceDuration)).toEqual([null, null, null, null, null]);
  });

  it("normalizes optional booking fields", () => {
    const parsed = bookAppointmentSchema.parse({ ...validBooking(), customerPhone: "  ", notes: "" });
    expect(parsed.customerPhone).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });

  it("only allows catalog style ids", () => {
    expect(bookAppointmentSchema.safeParse({ ...validBooking(), styleId: "mullet" }).success).toBe(false);
    expect(bookAppointmentSchema.safeParse({ ...validBooking(), styleId: "buzz-cut" }).success).toBe(true);
  });

  it("only allows cash or GCash when completing", () => {
    expect(appointmentActionSchema.safeParse({ action: "complete", paymentMethod: "card" }).success).toBe(false);
  });
});
