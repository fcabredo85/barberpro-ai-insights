import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createBarber, createService, listBarbers, listServices, updateBarber, updateService } from "@/lib/db/catalog";
import { getSale, listSales } from "@/lib/db/sales";
import { manilaDateRangeToUtc, manilaToday } from "@/lib/business/dates";
import { createSale } from "@/lib/sales/create-sale";
import type { CreateSaleInput } from "@/lib/validation/sales";

import { createOwnerWithShop, type TestClient } from "./supabase-test-env";

interface Shop {
  client: TestClient;
  shopId: string;
  barberId: string;
  serviceId: string;
}

async function seedShop(label: string): Promise<Shop> {
  const { client, shop } = await createOwnerWithShop(label);
  const barber = await createBarber(client, shop.id, { name: "Paolo", commissionRateBp: 4_000 });
  const service = await createService(client, shop.id, { name: "Haircut", priceCentavos: 25_000 });
  if (!barber.ok || !service.ok) throw new Error("catalog seed failed");
  return { client, shopId: shop.id, barberId: barber.id, serviceId: service.id };
}

function input(shop: Shop, overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    barberId: shop.barberId,
    serviceId: shop.serviceId,
    quantity: 2,
    paymentMethod: "cash",
    requestKey: randomUUID(),
    ...overrides,
  };
}

async function countSales(shop: Shop, requestKey: string): Promise<number> {
  const { count } = await shop.client
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("request_key", requestKey);
  return count ?? -1;
}

let a: Shop;
let b: Shop;

beforeAll(async () => {
  [a, b] = await Promise.all([seedShop("sales-a"), seedShop("sales-b")]);
});

describe("catalog management", () => {
  it("adds, lists, edits and deactivates barbers with exact rates", async () => {
    const created = await createBarber(a.client, a.shopId, { name: "Migs", commissionRateBp: 3_333 });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.id : "";

    expect((await listBarbers(a.client, a.shopId)).find((x) => x.id === id)).toEqual({
      id,
      name: "Migs",
      commissionRateBp: 3_333,
      active: true,
    });

    expect(await updateBarber(a.client, a.shopId, id, { name: "Miguel", commissionRateBp: 4_550 })).toEqual({ ok: true, id });
    expect(await updateBarber(a.client, a.shopId, id, { active: false })).toEqual({ ok: true, id });

    const active = await listBarbers(a.client, a.shopId, { activeOnly: true });
    expect(active.some((x) => x.id === id)).toBe(false);
    const all = await listBarbers(a.client, a.shopId);
    expect(all.find((x) => x.id === id)).toMatchObject({ name: "Miguel", commissionRateBp: 4_550, active: false });
  });

  it("adds and edits services with exact centavo prices", async () => {
    const created = await createService(a.client, a.shopId, { name: "Beard", priceCentavos: 19_999 });
    const id = created.ok ? created.id : "";
    expect((await listServices(a.client, a.shopId)).find((x) => x.id === id)?.priceCentavos).toBe(19_999);
    await updateService(a.client, a.shopId, id, { priceCentavos: 12_550 });
    expect((await listServices(a.client, a.shopId)).find((x) => x.id === id)?.priceCentavos).toBe(12_550);
  });

  it("cannot edit or deactivate another shop's barber or service", async () => {
    expect(await updateBarber(b.client, a.shopId, a.barberId, { commissionRateBp: 10_000 })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await updateBarber(b.client, b.shopId, a.barberId, { active: false })).toEqual({ ok: false, reason: "not_found" });
    expect(await updateService(b.client, b.shopId, a.serviceId, { priceCentavos: 1 })).toEqual({ ok: false, reason: "not_found" });
    expect(await listBarbers(b.client, a.shopId)).toEqual([]);
  });

  it("cannot add catalog items to another shop", async () => {
    expect(await createBarber(b.client, a.shopId, { name: "Intruder", commissionRateBp: 1 })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });
});

describe("createSale: snapshots and integer-centavo math", () => {
  it("records ₱250.00 × 2 at 40% as ₱500.00 with ₱200.00 commission", async () => {
    const result = await createSale(a.client, a.shopId, input(a));
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.sale).toMatchObject({
      unitPriceCentavos: 25_000,
      quantity: 2,
      grossCentavos: 50_000,
      commissionRateBp: 4_000,
      commissionCentavos: 20_000,
      paymentMethod: "cash",
      barberName: "Paolo",
      serviceName: "Haircut",
    });

    const { data: row } = await a.client
      .from("sales")
      .select("unit_price, gross_total, commission_rate, commission_amount")
      .eq("id", result.sale.id)
      .single();
    expect(row).toEqual({ unit_price: 250, gross_total: 500, commission_rate: 0.4, commission_amount: 200 });
  });

  it.each([
    ["half-up rounding", 125, 5_000, 1, 125, 63],
    ["below-half rounding", 19_999, 3_333, 3, 59_997, 19_997],
    ["tiny amounts", 10, 1_000, 3, 30, 3],
    ["max price and quantity", 10_000_000, 9_999, 20, 200_000_000, 199_980_000],
  ])("agrees with the database CHECK constraint on %s", async (_label, price, rate, qty, gross, commission) => {
    const barber = await createBarber(a.client, a.shopId, { name: `B-${rate}`, commissionRateBp: rate });
    const service = await createService(a.client, a.shopId, { name: `S-${price}`, priceCentavos: price });
    if (!barber.ok || !service.ok) throw new Error("seed failed");
    const result = await createSale(a.client, a.shopId, { ...input(a), barberId: barber.id, serviceId: service.id, quantity: qty });
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.sale.grossCentavos).toBe(gross);
      expect(result.sale.commissionCentavos).toBe(commission);
    }
  });

  it("snapshots price and rate: later catalog changes don't alter recorded sales", async () => {
    const service = await createService(a.client, a.shopId, { name: "Snapshot cut", priceCentavos: 30_000 });
    const barber = await createBarber(a.client, a.shopId, { name: "Snapshot barber", commissionRateBp: 2_500 });
    if (!service.ok || !barber.ok) throw new Error("seed failed");
    const sel = { serviceId: service.id, barberId: barber.id, quantity: 1 };

    const first = await createSale(a.client, a.shopId, input(a, sel));
    await updateService(a.client, a.shopId, service.id, { priceCentavos: 35_000 });
    await updateBarber(a.client, a.shopId, barber.id, { commissionRateBp: 5_000 });
    const second = await createSale(a.client, a.shopId, input(a, sel));

    if (first.kind !== "created" || second.kind !== "created") throw new Error("sales not created");
    const reloaded = await getSale(a.client, a.shopId, first.sale.id);
    expect(reloaded).toMatchObject({ unitPriceCentavos: 30_000, commissionRateBp: 2_500, commissionCentavos: 7_500 });
    expect(second.sale).toMatchObject({ unitPriceCentavos: 35_000, commissionRateBp: 5_000, commissionCentavos: 17_500 });
  });

  it("records GCash as a payment method", async () => {
    const result = await createSale(a.client, a.shopId, input(a, { paymentMethod: "gcash" }));
    expect(result.kind === "created" && result.sale.paymentMethod).toBe("gcash");
  });
});

describe("createSale: request-key idempotency", () => {
  it("returns the original sale for a repeated request instead of recording twice", async () => {
    const payload = input(a);
    const first = await createSale(a.client, a.shopId, payload);
    const second = await createSale(a.client, a.shopId, payload);
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("replayed");
    if (first.kind === "created" && second.kind === "replayed") expect(second.sale.id).toBe(first.sale.id);
    expect(await countSales(a, payload.requestKey)).toBe(1);
  });

  it("records exactly one sale when the same request arrives 5 times concurrently", async () => {
    const payload = input(a);
    const results = await Promise.all(Array.from({ length: 5 }, () => createSale(a.client, a.shopId, payload)));

    const kinds = results.map((r) => r.kind).sort();
    expect(kinds.filter((k) => k === "created")).toHaveLength(1);
    expect(kinds.filter((k) => k === "replayed")).toHaveLength(4);
    const ids = new Set(results.map((r) => ("sale" in r ? r.sale.id : null)));
    expect(ids.size).toBe(1);
    expect(await countSales(a, payload.requestKey)).toBe(1);
  });

  it("reports a conflict when a request key is reused with different details", async () => {
    const payload = input(a);
    await createSale(a.client, a.shopId, payload);
    expect((await createSale(a.client, a.shopId, { ...payload, quantity: 3 })).kind).toBe("conflict");
    expect((await createSale(a.client, a.shopId, { ...payload, paymentMethod: "gcash" })).kind).toBe("conflict");
    expect(await countSales(a, payload.requestKey)).toBe(1);
  });

  it("treats the same key in different shops independently", async () => {
    const requestKey = randomUUID();
    expect((await createSale(a.client, a.shopId, input(a, { requestKey }))).kind).toBe("created");
    expect((await createSale(b.client, b.shopId, input(b, { requestKey }))).kind).toBe("created");
  });
});

describe("createSale: tenant ownership", () => {
  it("rejects another shop's barber or service as an invalid selection", async () => {
    expect(await createSale(b.client, b.shopId, input(b, { barberId: a.barberId }))).toEqual({
      kind: "invalid_selection",
      field: "barberId",
    });
    expect(await createSale(b.client, b.shopId, input(b, { serviceId: a.serviceId }))).toEqual({
      kind: "invalid_selection",
      field: "serviceId",
    });
  });

  it("cannot record into another shop even if its id is known", async () => {
    // B passes A's shop id directly (the API never allows this; this proves RLS also blocks it).
    const payload = input(a);
    const result = await createSale(b.client, a.shopId, payload);
    expect(result.kind).toBe("invalid_selection");
    // Nothing was written to A's shop under that key (checked as A, who can see A's sales).
    expect(await countSales(a, payload.requestKey)).toBe(0);
  });

  it("rejects deactivated barbers and services", async () => {
    const barber = await createBarber(a.client, a.shopId, { name: "Gone", commissionRateBp: 4_000 });
    const service = await createService(a.client, a.shopId, { name: "Gone cut", priceCentavos: 25_000 });
    if (!barber.ok || !service.ok) throw new Error("seed failed");
    await updateBarber(a.client, a.shopId, barber.id, { active: false });
    await updateService(a.client, a.shopId, service.id, { active: false });

    expect((await createSale(a.client, a.shopId, input(a, { barberId: barber.id }))).kind).toBe("invalid_selection");
    expect((await createSale(a.client, a.shopId, input(a, { serviceId: service.id }))).kind).toBe("invalid_selection");
  });
});

describe("sales history and receipts", () => {
  it("lists today's sales newest first and loads a receipt", async () => {
    const result = await createSale(a.client, a.shopId, input(a, { quantity: 1 }));
    if (result.kind !== "created") throw new Error("not created");

    const today = manilaToday();
    const { sales } = await listSales(a.client, a.shopId, manilaDateRangeToUtc(today, today));
    expect(sales[0]?.id).toBe(result.sale.id);
    for (let i = 1; i < sales.length; i++) expect(sales[i - 1]!.occurredAt >= sales[i]!.occurredAt).toBe(true);

    expect(await getSale(a.client, a.shopId, result.sale.id)).toMatchObject({ id: result.sale.id, grossCentavos: 25_000 });
  });

  it("hides another shop's receipt and history", async () => {
    const result = await createSale(a.client, a.shopId, input(a));
    if (result.kind !== "created") throw new Error("not created");
    expect(await getSale(b.client, b.shopId, result.sale.id)).toBeNull();
    expect(await getSale(b.client, a.shopId, result.sale.id)).toBeNull();
    const today = manilaToday();
    const { sales } = await listSales(b.client, a.shopId, manilaDateRangeToUtc(today, today));
    expect(sales).toEqual([]);
  });

  it("excludes sales outside the date range", async () => {
    const { sales } = await listSales(a.client, a.shopId, manilaDateRangeToUtc("2020-01-01", "2020-01-31"));
    expect(sales).toEqual([]);
  });
});
