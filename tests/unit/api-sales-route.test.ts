// @vitest-environment node
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  createSale: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/sales/create-sale", () => ({ createSale: mocks.createSale }));

import { POST } from "@/app/api/sales/route";

const SHOP_ID = randomUUID();

function body() {
  return { barberId: randomUUID(), serviceId: randomUUID(), quantity: 2, paymentMethod: "cash", requestKey: randomUUID() };
}

function post(payload: unknown, contentType = "application/json") {
  return POST(
    new Request("http://localhost/api/sales", {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

const sale = {
  id: randomUUID(),
  occurredAt: "2026-11-06T06:00:00.000Z",
  barberId: randomUUID(),
  barberName: "Paolo",
  serviceId: randomUUID(),
  serviceName: "Haircut",
  quantity: 2,
  unitPriceCentavos: 25_000,
  grossCentavos: 50_000,
  commissionRateBp: 4_000,
  commissionCentavos: 20_000,
  paymentMethod: "cash" as const,
  requestKey: randomUUID(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: SHOP_ID, name: "Shop", role: "owner" });
});

describe("POST /api/sales: authentication and authorization", () => {
  it("returns 401 for signed-out requests and records nothing", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post(body());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Sign in to record sales." } });
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("returns 403 when the user has no barbershop membership", async () => {
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    const res = await post(body());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("uses the barbershop from the verified membership, not the request", async () => {
    mocks.createSale.mockResolvedValue({ kind: "created", sale });
    const payload = body();
    await post(payload);
    expect(mocks.createSale).toHaveBeenCalledWith(expect.anything(), SHOP_ID, payload);
  });

  it("rejects an attempt to pick another barbershop with 400", async () => {
    const res = await post({ ...body(), barbershopId: randomUUID() });
    expect(res.status).toBe(400);
    expect(mocks.createSale).not.toHaveBeenCalled();
  });
});

describe("POST /api/sales: input validation", () => {
  it("returns 415 for non-JSON bodies (blocks simple cross-site form posts)", async () => {
    const res = await post("barberId=x", "application/x-www-form-urlencoded");
    expect(res.status).toBe(415);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("returns 400 with field errors for invalid values", async () => {
    const res = await post({ ...body(), quantity: 0, paymentMethod: "card" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.fields).toHaveProperty("quantity");
    expect(json.error.fields).toHaveProperty("paymentMethod");
  });

  it("rejects client-supplied prices", async () => {
    const res = await post({ ...body(), unitPrice: 1 });
    expect(res.status).toBe(400);
    expect(mocks.createSale).not.toHaveBeenCalled();
  });
});

describe("POST /api/sales: outcomes", () => {
  it("returns 201 with the receipt in integer centavos", async () => {
    mocks.createSale.mockResolvedValue({ kind: "created", sale });
    const res = await post(body());
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/sales/${sale.id}`);
    const { data } = await res.json();
    expect(data).toMatchObject({ id: sale.id, grossCentavos: 50_000, commissionCentavos: 20_000, paymentMethod: "cash" });
  });

  it("returns 200 with the original receipt for a duplicate request", async () => {
    mocks.createSale.mockResolvedValue({ kind: "replayed", sale });
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(res.headers.get("idempotent-replayed")).toBe("true");
    expect((await res.json()).data.id).toBe(sale.id);
  });

  it("returns 409 when a request key is reused for a different sale", async () => {
    mocks.createSale.mockResolvedValue({ kind: "conflict" });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("returns 400 when the barber or service isn't available to this shop", async () => {
    mocks.createSale.mockResolvedValue({ kind: "invalid_selection", field: "barberId" });
    const res = await post(body());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_SELECTION");
    expect(json.error.fields).toHaveProperty("barberId");
  });

  it("returns a safe 500 without internal details when something throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSale.mockRejectedValue(new Error("relation public.sales: connection refused at 10.0.0.5"));
    const res = await post(body());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("10.0.0.5");
    expect(text).not.toContain("stack");
    spy.mockRestore();
  });

  it("never caches responses", async () => {
    mocks.createSale.mockResolvedValue({ kind: "created", sale });
    const res = await post(body());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
