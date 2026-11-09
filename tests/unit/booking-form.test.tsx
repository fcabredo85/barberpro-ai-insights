import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookingForm } from "@/components/appointments/booking-form";

const BARBERS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Paolo" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Migs" },
];
const SERVICES = [{ id: "33333333-3333-4333-8333-333333333333", name: "Haircut", priceLabel: "₱250.00", durationMinutes: 60 }];
const SLOT_A = "2026-11-20T02:00:00.000Z"; // 10:00 AM Manila
const SLOT_B = "2026-11-20T02:15:00.000Z";

const fetchMock = vi.fn();
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function availability(slots: string[]) {
  return res(200, { data: { date: "2026-11-20", slots } });
}

async function renderReady(props: Partial<Parameters<typeof BookingForm>[0]> = {}) {
  fetchMock.mockImplementation(async (url: string) => (String(url).includes("availability") ? availability([SLOT_A, SLOT_B]) : res(500, {})));
  await act(async () => {
    render(<BookingForm barbers={BARBERS} services={SERVICES} today="2026-11-20" maxDate="2027-01-19" {...props} />);
  });
  fireEvent.change(screen.getByLabelText("Barber"), { target: { value: BARBERS[0]!.id } });
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Juan" } });
}

describe("BookingForm (FR-14)", () => {
  it("loads real availability for the chosen barber, service and date", async () => {
    await renderReady();
    const url = String(fetchMock.mock.calls.at(-1)![0]);
    expect(url).toContain("/api/appointments/availability?");
    expect(url).toContain(`barberId=${BARBERS[0]!.id}`);
    expect(url).toContain(`serviceId=${SERVICES[0]!.id}`);
    expect(url).toContain("date=2026-11-20");
    expect(screen.getByRole("radio", { name: /10:00/ })).toBeInTheDocument();
    expect(screen.getByText(/Haircut takes 60 minutes/)).toBeInTheDocument();
  });

  it("keeps Confirm disabled until a time is chosen", async () => {
    await renderReady();
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /10:00/ }));
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeEnabled();
  });

  it("clears the chosen time when the barber changes", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("radio", { name: /10:00/ }));
    fireEvent.change(screen.getByLabelText("Barber"), { target: { value: BARBERS[1]!.id } });
    await act(async () => {});
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeDisabled();
  });

  it("shows Confirmed with the booking ID only after the server confirms", async () => {
    await renderReady({ look: { id: "44444444-4444-4444-8444-444444444444", customerLabel: "Juan", styleName: "Pompadour", previewUrl: null } });
    fireEvent.click(screen.getByRole("radio", { name: /10:00/ }));
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)));
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    const [, init] = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ barberId: BARBERS[0]!.id, serviceId: SERVICES[0]!.id, startsAt: SLOT_A, customerName: "Juan", savedLookId: "44444444-4444-4444-8444-444444444444" });
    expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty("price");
    expect(screen.queryByText(/appointment confirmed/i)).not.toBeInTheDocument();

    await act(async () =>
      resolve(res(201, { data: { appointmentId: "appt-123", status: "confirmed", startsAt: SLOT_A, endsAt: "2026-11-20T03:00:00.000Z", duplicate: false } })),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Appointment confirmed");
    expect(screen.getByText("appt-123")).toBeInTheDocument();
    expect(screen.getByText("Pompadour")).toBeInTheDocument();
  });

  it("refreshes availability and uses a new request key when the time was taken", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("radio", { name: /10:00/ }));
    fetchMock.mockImplementationOnce(async () => res(409, { error: { code: "IDEMPOTENCY_CONFLICT", message: "That time was just booked.", fields: { startsAt: "taken" } } }));
    fetchMock.mockImplementation(async () => availability([SLOT_B]));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /confirm booking/i })));
    const firstKey = JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === "POST")![1].body).requestKey;

    expect(screen.getByRole("alert")).toHaveTextContent("just booked");
    expect(screen.queryByRole("radio", { name: /10:00/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /10:15/ }));
    fetchMock.mockImplementationOnce(async () => res(201, { data: { appointmentId: "x", status: "confirmed", startsAt: SLOT_B, endsAt: SLOT_B, duplicate: false } }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /confirm booking/i })));
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(JSON.parse(posts[1]![1].body).requestKey).not.toBe(firstKey);
  });

  it("keeps the same request key after a network error so a retry can't double-book", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("radio", { name: /10:00/ }));
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /confirm booking/i })));
    expect(screen.getByRole("alert")).toHaveTextContent(/network error/i);
    fetchMock.mockImplementationOnce(async () => res(200, { data: { appointmentId: "x", status: "confirmed", startsAt: SLOT_A, endsAt: SLOT_A, duplicate: true } }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /confirm booking/i })));
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(JSON.parse(posts[0]![1].body).requestKey).toBe(JSON.parse(posts[1]![1].body).requestKey);
  });

  it("explains when there are no open times", async () => {
    fetchMock.mockImplementation(async () => availability([]));
    await act(async () => {
      render(<BookingForm barbers={[BARBERS[0]!]} services={SERVICES} today="2026-11-20" maxDate="2027-01-19" />);
    });
    expect(screen.getByText(/no open times on this date/i)).toBeInTheDocument();
  });

  it("asks for a barber and service in Settings when none exist", () => {
    render(<BookingForm barbers={[]} services={SERVICES} today="2026-11-20" maxDate="2027-01-19" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
