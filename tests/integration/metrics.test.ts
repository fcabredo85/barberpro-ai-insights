import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, manilaToday } from "@/lib/business/dates";
import { decimalToCentavos } from "@/lib/business/money";
import { createBarber, createService } from "@/lib/db/catalog";
import { getSalesReport } from "@/lib/db/metrics";
import { createSale } from "@/lib/sales/create-sale";

import { createOwnerWithShop, newClient, type TestClient } from "./supabase-test-env";

interface Shop {
  client: TestClient;
  shopId: string;
}

let populated: Shop;
let empty: Shop;
let today: string;

/** Sum persisted rows directly, independent of the report code. */
async function persistedTotals(shop: Shop) {
  const { data, error } = await shop.client
    .from("sales")
    .select("gross_total, commission_amount, quantity, barber_id, service_id")
    .eq("barbershop_id", shop.shopId);
  if (error) throw error;
  const byBarber = new Map<string, number>();
  const byService = new Map<string, number>();
  let gross = 0;
  let commission = 0;
  let quantity = 0;
  for (const row of data) {
    const g = decimalToCentavos(row.gross_total);
    gross += g;
    commission += decimalToCentavos(row.commission_amount);
    quantity += row.quantity;
    byBarber.set(row.barber_id, (byBarber.get(row.barber_id) ?? 0) + g);
    byService.set(row.service_id, (byService.get(row.service_id) ?? 0) + g);
  }
  return { gross, commission, quantity, count: data.length, byBarber, byService };
}

beforeAll(async () => {
  today = manilaToday();
  const [p, e] = await Promise.all([createOwnerWithShop("metrics-full"), createOwnerWithShop("metrics-empty")]);
  populated = { client: p.client, shopId: p.shop.id };
  empty = { client: e.client, shopId: e.shop.id };

  const db = populated.client;
  const paolo = await createBarber(db, populated.shopId, { name: "Paolo", commissionRateBp: 4_000 });
  const migs = await createBarber(db, populated.shopId, { name: "Migs", commissionRateBp: 3_333 });
  const cut = await createService(db, populated.shopId, { name: "Haircut", priceCentavos: 25_000 });
  const beard = await createService(db, populated.shopId, { name: "Beard trim", priceCentavos: 19_999 });
  if (!paolo.ok || !migs.ok || !cut.ok || !beard.ok) throw new Error("catalog seed failed");

  const sales = [
    { barberId: paolo.id, serviceId: cut.id, quantity: 2, paymentMethod: "cash" as const },
    { barberId: paolo.id, serviceId: beard.id, quantity: 1, paymentMethod: "gcash" as const },
    { barberId: migs.id, serviceId: cut.id, quantity: 1, paymentMethod: "cash" as const },
    { barberId: migs.id, serviceId: beard.id, quantity: 3, paymentMethod: "gcash" as const },
  ];
  for (const s of sales) {
    const result = await createSale(db, populated.shopId, { ...s, requestKey: randomUUID() });
    if (result.kind !== "created") throw new Error(`sale not created: ${result.kind}`);
  }
});

describe("sales report: empty dataset", () => {
  it("returns zeros, empty breakdowns and a zero-filled day for a shop with no sales", async () => {
    const report = await getSalesReport(empty.client, empty.shopId, today, today);
    expect(report.isEmpty).toBe(true);
    expect(report.totals).toEqual({
      grossCentavos: 0,
      transactionCount: 0,
      commissionCentavos: 0,
      averageTransactionCentavos: 0,
      servicesPerformed: 0,
    });
    expect(report.daily).toEqual([{ date: today, grossCentavos: 0, commissionCentavos: 0, transactionCount: 0 }]);
    expect(report.byBarber).toEqual([]);
    expect(report.byService).toEqual([]);
  });

  it("returns an empty report for a range with no sales, even in a busy shop", async () => {
    const lastMonthEnd = addDays(today, -30);
    const report = await getSalesReport(populated.client, populated.shopId, addDays(lastMonthEnd, -6), lastMonthEnd);
    expect(report.isEmpty).toBe(true);
    expect(report.daily).toHaveLength(7);
  });
});

describe("sales report: populated dataset", () => {
  it("totals match the persisted sales records exactly", async () => {
    const report = await getSalesReport(populated.client, populated.shopId, today, today);
    const persisted = await persistedTotals(populated);

    expect(report.totals.grossCentavos).toBe(persisted.gross);
    expect(report.totals.commissionCentavos).toBe(persisted.commission);
    expect(report.totals.transactionCount).toBe(persisted.count);
    expect(report.totals.servicesPerformed).toBe(persisted.quantity);

    // Known values: 500.00 + 199.99 + 250.00 + 599.97 = 1,549.96
    expect(report.totals.grossCentavos).toBe(154_996);
    expect(report.totals.transactionCount).toBe(4);
    // 1,549.96 / 4 = 387.49
    expect(report.totals.averageTransactionCentavos).toBe(38_749);
  });

  it("commission total equals the sum of each sale's rounded commission", async () => {
    // Paolo 40%: 200.00 + 80.00 (79.996 -> 80.00); Migs 33.33%: 83.33 (83.325 -> 83.33) + 199.97 (199.970001)
    const report = await getSalesReport(populated.client, populated.shopId, today, today);
    expect(report.totals.commissionCentavos).toBe(20_000 + 8_000 + 8_333 + 19_997);
  });

  it("buckets today's sales on today's Asia/Manila date", async () => {
    const report = await getSalesReport(populated.client, populated.shopId, addDays(today, -6), today);
    expect(report.daily).toHaveLength(7);
    expect(report.daily.at(-1)).toMatchObject({ date: today, grossCentavos: 154_996, transactionCount: 4 });
    expect(report.daily.slice(0, -1).every((d) => d.grossCentavos === 0)).toBe(true);
  });

  it("breakdowns by barber and by service match persisted records and add up to the total", async () => {
    const report = await getSalesReport(populated.client, populated.shopId, today, today);
    const persisted = await persistedTotals(populated);

    for (const row of report.byBarber) expect(row.grossCentavos).toBe(persisted.byBarber.get(row.id!));
    for (const row of report.byService) expect(row.grossCentavos).toBe(persisted.byService.get(row.id!));

    expect(report.byBarber.map((r) => [r.name, r.grossCentavos, r.transactionCount])).toEqual([
      ["Migs", 84_997, 2],
      ["Paolo", 69_999, 2],
    ]);
    expect(report.byService.map((r) => [r.name, r.grossCentavos, r.quantity])).toEqual([
      ["Beard trim", 79_996, 4],
      ["Haircut", 75_000, 3],
    ]);
    const sum = (rows: { grossCentavos: number }[]) => rows.reduce((a, r) => a + r.grossCentavos, 0);
    expect(sum(report.byBarber)).toBe(report.totals.grossCentavos);
    expect(sum(report.byService)).toBe(report.totals.grossCentavos);
  });

  it("excludes tomorrow and yesterday (half-open UTC window)", async () => {
    expect((await getSalesReport(populated.client, populated.shopId, addDays(today, 1), addDays(today, 1))).isEmpty).toBe(true);
    expect((await getSalesReport(populated.client, populated.shopId, addDays(today, -1), addDays(today, -1))).isEmpty).toBe(true);
  });
});

describe("sales report: tenant isolation", () => {
  it("another owner asking for this shop's report gets nothing (RLS)", async () => {
    const report = await getSalesReport(empty.client, populated.shopId, today, today);
    expect(report.isEmpty).toBe(true);
    expect(report.totals.grossCentavos).toBe(0);
    expect(report.byBarber).toEqual([]);
  });

  it("signed-out callers cannot run the report function", async () => {
    const { error } = await newClient().rpc("sales_report", {
      p_barbershop_id: populated.shopId,
      p_start: new Date(Date.now() - 86_400_000).toISOString(),
      p_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error?.code).toBe("42501");
  });
});
