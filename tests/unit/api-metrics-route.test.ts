// @vitest-environment node
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  getSalesReport: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/db/metrics", () => ({ getSalesReport: mocks.getSalesReport }));

import { GET } from "@/app/api/metrics/route";
import { EMPTY_AGGREGATES, buildSalesReport } from "@/lib/business/metrics";
import { manilaToday } from "@/lib/business/dates";

const SHOP_ID = randomUUID();
const get = (query = "") => GET(new NextRequest(`http://localhost/api/metrics${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: SHOP_ID, name: "Shop", role: "owner" });
  mocks.getSalesReport.mockImplementation(async (_db, _shop, from: string, to: string) =>
    buildSalesReport(EMPTY_AGGREGATES, from, to),
  );
});

describe("GET /api/metrics", () => {
  it("returns 401 when signed out and runs no query", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    expect(mocks.getSalesReport).not.toHaveBeenCalled();
  });

  it("returns 403 without a barbershop membership", async () => {
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(403);
    expect(mocks.getSalesReport).not.toHaveBeenCalled();
  });

  it("defaults to today in Asia/Manila and returns an empty report with zeros", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const today = manilaToday();
    expect(mocks.getSalesReport).toHaveBeenCalledWith(expect.anything(), SHOP_ID, today, today);
    expect(data.isEmpty).toBe(true);
    expect(data.totals).toEqual({
      grossCentavos: 0,
      transactionCount: 0,
      commissionCentavos: 0,
      averageTransactionCentavos: 0,
      servicesPerformed: 0,
    });
    expect(data.range.timeZone).toBe("Asia/Manila");
  });

  it("scopes to the caller's membership and ignores any barbershop parameter", async () => {
    await get(`?range=7d&barbershopId=${randomUUID()}`);
    expect(mocks.getSalesReport).toHaveBeenCalledWith(expect.anything(), SHOP_ID, expect.any(String), expect.any(String));
  });

  it("accepts an explicit date range", async () => {
    const res = await get("?from=2026-11-01&to=2026-11-07");
    expect(res.status).toBe(200);
    expect(mocks.getSalesReport).toHaveBeenCalledWith(expect.anything(), SHOP_ID, "2026-11-01", "2026-11-07");
    expect((await res.json()).data.daily).toHaveLength(7);
  });

  it.each([
    ["reversed dates", "?from=2026-11-07&to=2026-11-01"],
    ["malformed date", "?from=11/01/2026&to=2026-11-07"],
    ["missing end date", "?from=2026-11-01"],
    ["range too long", "?from=2020-01-01&to=2026-11-01"],
    ["unknown preset", "?range=forever"],
  ])("returns 400 for %s", async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mocks.getSalesReport).not.toHaveBeenCalled();
  });

  it("returns a safe 500 without internal details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getSalesReport.mockRejectedValue(new Error("permission denied for function sales_report at 10.1.2.3"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("10.1.2.3");
    spy.mockRestore();
  });

  it("is never cached", async () => {
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
