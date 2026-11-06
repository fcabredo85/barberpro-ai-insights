import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SaleForm } from "@/components/sales/sale-form";

const services = [{ id: "11111111-1111-4111-8111-111111111111", name: "Haircut", value: 25_000 }];
const barbers = [{ id: "22222222-2222-4222-8222-222222222222", name: "Paolo", value: 4_000 }];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  router.push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
  fireEvent.click(screen.getByLabelText("Cash"));
  fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
}

describe("SaleForm", () => {
  it("shows a live estimate using exact centavo math", () => {
    render(<SaleForm services={services} barbers={barbers} />);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
    expect(screen.getByText("₱200.00")).toBeInTheDocument();
  });

  it("blocks submission until a payment method is chosen", () => {
    render(<SaleForm services={services} barbers={barbers} />);
    fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
    expect(screen.getByText("Choose how the customer already paid.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only ids, quantity, method and a request key; never prices", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: "sale-1" } }));
    render(<SaleForm services={services} barbers={barbers} />);
    fillAndSubmit();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/sales/sale-1?recorded=1"));

    const [body] = sentBodies();
    expect(Object.keys(body).sort()).toEqual(["barberId", "paymentMethod", "quantity", "requestKey", "serviceId"]);
    expect(body).toMatchObject({ quantity: 2, paymentMethod: "cash", serviceId: services[0]!.id, barberId: barbers[0]!.id });
    expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses the same request key when retrying after a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "sale-1" } }));
    render(<SaleForm services={services} barbers={barbers} />);

    fillAndSubmit();
    expect(await screen.findByText(/the sale will not be duplicated/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());

    const [first, second] = sentBodies();
    expect(second.requestKey).toBe(first.requestKey);
  });

  it("starts a fresh request key after a 409 conflict", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: "IDEMPOTENCY_CONFLICT", message: "This request key was already used." } }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: { id: "sale-2" } }));
    render(<SaleForm services={services} barbers={barbers} />);

    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("already used");
    fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/sales/sale-2?recorded=1"));

    const [first, second] = sentBodies();
    expect(second.requestKey).not.toBe(first.requestKey);
  });

  it("ignores a second click while the first request is in flight", async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<SaleForm services={services} barbers={barbers} />);

    fillAndSubmit();
    const button = await screen.findByRole("button", { name: "Recording…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse(201, { data: { id: "sale-3" } }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
  });

  it("shows server field errors and redirects to login on 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: "INVALID_SELECTION", message: "That barber isn't available.", fields: { barberId: "Not available in your barbershop." } } }),
    );
    render(<SaleForm services={services} barbers={barbers} />);
    fillAndSubmit();
    expect(await screen.findByText("Not available in your barbershop.")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Sign in." } }));
    fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?next=/sales/new"));
  });
});
