import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createOwnerWithShop, newClient, signUpUser, type TestClient } from "./supabase-test-env";

interface Owner {
  client: TestClient;
  userId: string;
  shopId: string;
  barberId: string;
  serviceId: string;
  saleId: string;
}

/** A valid sale payload: 250.00 x 2 at 40% => gross 500.00, commission 200.00. */
function salePayload(shopId: string, barberId: string, serviceId: string) {
  return {
    barbershop_id: shopId,
    barber_id: barberId,
    service_id: serviceId,
    quantity: 2,
    unit_price: 250,
    gross_total: 500,
    commission_rate: 0.4,
    commission_amount: 200,
    payment_method: "cash" as const,
    request_key: randomUUID(),
  };
}

async function seedOwner(label: string): Promise<Owner> {
  const { client, userId, shop } = await createOwnerWithShop(label);

  const barber = await client
    .from("barbers")
    .insert({ barbershop_id: shop.id, name: `${label} Barber`, commission_rate: 0.4 })
    .select("id")
    .single();
  if (barber.error) throw new Error(`barber insert failed: ${barber.error.message}`);

  const service = await client
    .from("services")
    .insert({ barbershop_id: shop.id, name: "Haircut", price: 250 })
    .select("id")
    .single();
  if (service.error) throw new Error(`service insert failed: ${service.error.message}`);

  const sale = await client
    .from("sales")
    .insert(salePayload(shop.id, barber.data.id, service.data.id))
    .select("id, created_by")
    .single();
  if (sale.error) throw new Error(`sale insert failed: ${sale.error.message}`);
  if (sale.data.created_by !== userId) throw new Error("sale.created_by was not set from the JWT");

  return { client, userId, shopId: shop.id, barberId: barber.data.id, serviceId: service.data.id, saleId: sale.data.id };
}

let a: Owner;
let b: Owner;
let outsider: TestClient;

beforeAll(async () => {
  [a, b] = await Promise.all([seedOwner("owner-a"), seedOwner("owner-b")]);
  outsider = (await signUpUser("outsider")).client;
});

describe("cross-tenant reads are invisible", () => {
  it("owner B cannot read owner A's barbershop", async () => {
    const { data, error } = await b.client.from("barbershops").select("id").eq("id", a.shopId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(["barbers", "services", "sales"] as const)("owner B cannot read owner A's %s", async (table) => {
    const { data, error } = await b.client.from(table).select("id").eq("barbershop_id", a.shopId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("owner B cannot read owner A's records even by exact id", async () => {
    const barber = await b.client.from("barbers").select("id").eq("id", a.barberId);
    const sale = await b.client.from("sales").select("id").eq("id", a.saleId);
    expect(barber.data).toEqual([]);
    expect(sale.data).toEqual([]);
  });

  it("each owner sees exactly their own workspace", async () => {
    const { data: aShops } = await a.client.from("barbershops").select("id");
    const { data: bShops } = await b.client.from("barbershops").select("id");
    expect(aShops).toEqual([{ id: a.shopId }]);
    expect(bShops).toEqual([{ id: b.shopId }]);
  });

  it("memberships expose only the caller's own rows", async () => {
    const { data } = await b.client.from("memberships").select("user_id");
    expect(data).toEqual([{ user_id: b.userId }]);
  });

  it("a signed-in user without a workspace sees no tenant data", async () => {
    for (const table of ["barbershops", "barbers", "services", "sales"] as const) {
      const { data } = await outsider.from(table).select("id");
      expect(data).toEqual([]);
    }
  });

  it("anonymous clients are denied outright", async () => {
    const anon = newClient();
    for (const table of ["barbershops", "memberships", "barbers", "services", "sales"] as const) {
      const { error } = await anon.from(table).select("*");
      expect(error?.code).toBe("42501");
    }
  });
});

describe("cross-tenant writes are rejected", () => {
  it("owner B cannot add a barber or service to owner A's shop", async () => {
    const barber = await b.client
      .from("barbers")
      .insert({ barbershop_id: a.shopId, name: "Intruder", commission_rate: 0.5 });
    expect(barber.error?.code).toBe("42501");

    const service = await b.client.from("services").insert({ barbershop_id: a.shopId, name: "Fake", price: 1 });
    expect(service.error?.code).toBe("42501");
  });

  it("owner B cannot modify owner A's catalog or workspace", async () => {
    const barber = await b.client.from("barbers").update({ commission_rate: 1 }).eq("id", a.barberId).select("id");
    expect(barber.data).toEqual([]);

    const shop = await b.client.from("barbershops").update({ name: "Hijacked" }).eq("id", a.shopId).select("id");
    expect(shop.data).toEqual([]);

    const { data: check } = await a.client.from("barbers").select("commission_rate").eq("id", a.barberId).single();
    expect(check?.commission_rate).toBe(0.4);
    const { data: shopCheck } = await a.client.from("barbershops").select("name").eq("id", a.shopId).single();
    expect(shopCheck?.name).toBe("owner-a Barbershop");
  });

  it("owner B cannot record a sale in owner A's shop", async () => {
    const { error } = await b.client.from("sales").insert(salePayload(a.shopId, a.barberId, a.serviceId));
    expect(error?.code).toBe("42501");
  });

  it("owner B cannot use owner A's barber or service in their own sale", async () => {
    // Rejected by RLS (B cannot see A's catalog); the same-shop composite
    // foreign key would also reject it (23503) as a second line of defense.
    const withBarber = await b.client.from("sales").insert(salePayload(b.shopId, a.barberId, b.serviceId));
    expect(withBarber.error?.code).toBe("42501");
    const withService = await b.client.from("sales").insert(salePayload(b.shopId, b.barberId, a.serviceId));
    expect(withService.error?.code).toBe("42501");
  });

  it("owner B cannot grant themselves membership in owner A's shop", async () => {
    const { error } = await b.client
      .from("memberships")
      .insert({ user_id: b.userId, barbershop_id: a.shopId, role: "owner" });
    expect(error?.code).toBe("42501");
  });

  it("a row cannot be moved to another tenant", async () => {
    const { error } = await a.client.from("barbers").update({ barbershop_id: b.shopId }).eq("id", a.barberId);
    expect(error?.code).toBe("42501");
  });
});

describe("sale integrity", () => {
  it("rejects a repeated request key for the same shop", async () => {
    const payload = salePayload(a.shopId, a.barberId, a.serviceId);
    expect((await a.client.from("sales").insert(payload)).error).toBeNull();
    const repeat = await a.client.from("sales").insert({ ...payload });
    expect(repeat.error?.code).toBe("23505");
  });

  it("allows the same request key in a different shop", async () => {
    const key = randomUUID();
    const inA = await a.client.from("sales").insert({ ...salePayload(a.shopId, a.barberId, a.serviceId), request_key: key });
    const inB = await b.client.from("sales").insert({ ...salePayload(b.shopId, b.barberId, b.serviceId), request_key: key });
    expect(inA.error).toBeNull();
    expect(inB.error).toBeNull();
  });

  it.each([
    ["commission that does not match gross x rate", { commission_amount: 199.99 }],
    ["gross that does not match price x quantity", { gross_total: 499 }],
    ["quantity above 20", { quantity: 21, gross_total: 5250, commission_amount: 2100 }],
    ["zero quantity", { quantity: 0, gross_total: 0, commission_amount: 0 }],
  ])("rejects %s", async (_label, override) => {
    const { error } = await a.client
      .from("sales")
      .insert({ ...salePayload(a.shopId, a.barberId, a.serviceId), ...override });
    expect(error?.code).toBe("23514");
  });
});

describe("sale snapshots must match the authorized catalog", () => {
  // Internally consistent arithmetic, but not the shop's real catalog values.
  it.each([
    ["a made-up unit price", { unit_price: 1, gross_total: 2, commission_amount: 0.8 }],
    ["a made-up commission rate", { commission_rate: 0, commission_amount: 0 }],
    ["a commission rate above 1", { commission_rate: 1.5, commission_amount: 750 }],
  ])("rejects %s, even sent directly to the database API", async (_label, override) => {
    const { error } = await a.client
      .from("sales")
      .insert({ ...salePayload(a.shopId, a.barberId, a.serviceId), ...override });
    expect(error?.code).toBe("42501");
  });

  it("rejects sales for a deactivated barber or service", async () => {
    const barber = await a.client
      .from("barbers")
      .insert({ barbershop_id: a.shopId, name: "Retired Barber", commission_rate: 0.4, active: false })
      .select("id")
      .single();
    const service = await a.client
      .from("services")
      .insert({ barbershop_id: a.shopId, name: "Retired Service", price: 250, active: false })
      .select("id")
      .single();
    expect(barber.error).toBeNull();
    expect(service.error).toBeNull();

    const withBarber = await a.client
      .from("sales")
      .insert(salePayload(a.shopId, barber.data!.id, a.serviceId));
    expect(withBarber.error?.code).toBe("42501");

    const withService = await a.client
      .from("sales")
      .insert(salePayload(a.shopId, a.barberId, service.data!.id));
    expect(withService.error?.code).toBe("42501");
  });

  it("keeps past snapshots unchanged when the catalog changes", async () => {
    const service = await a.client
      .from("services")
      .insert({ barbershop_id: a.shopId, name: "Beard Trim", price: 250 })
      .select("id")
      .single();
    const sale = await a.client
      .from("sales")
      .insert(salePayload(a.shopId, a.barberId, service.data!.id))
      .select("id")
      .single();
    expect(sale.error).toBeNull();

    await a.client.from("services").update({ price: 300 }).eq("id", service.data!.id);

    const { data } = await a.client
      .from("sales")
      .select("unit_price, gross_total")
      .eq("id", sale.data!.id)
      .single();
    expect(data).toEqual({ unit_price: 250, gross_total: 500 });
  });

  it("sales are immutable for clients", async () => {
    const update = await a.client.from("sales").update({ quantity: 1 }).eq("id", a.saleId);
    expect(update.error?.code).toBe("42501");
    const del = await a.client.from("sales").delete().eq("id", a.saleId);
    expect(del.error?.code).toBe("42501");
  });

  it("clients cannot set server-controlled columns", async () => {
    const backdated = await a.client
      .from("sales")
      .insert({ ...salePayload(a.shopId, a.barberId, a.serviceId), occurred_at: "2020-01-01T00:00:00Z" });
    expect(backdated.error?.code).toBe("42501");

    const impersonated = await a.client
      .from("sales")
      .insert({ ...salePayload(a.shopId, a.barberId, a.serviceId), created_by: b.userId });
    expect(impersonated.error?.code).toBe("42501");
  });
});

describe("catalog constraints", () => {
  it.each([
    ["commission rate above 1", { commission_rate: 1.01 }],
    ["negative commission rate", { commission_rate: -0.1 }],
    ["blank name", { name: "   " }],
  ])("rejects a barber with %s", async (_label, override) => {
    const { error } = await a.client
      .from("barbers")
      .insert({ barbershop_id: a.shopId, name: "Valid", commission_rate: 0.3, ...override });
    expect(error?.code).toBe("23514");
  });

  it.each([
    ["zero price", 0],
    ["negative price", -50],
  ])("rejects a service with %s", async (_label, price) => {
    const { error } = await a.client.from("services").insert({ barbershop_id: a.shopId, name: "Shave", price });
    expect(error?.code).toBe("23514");
  });

  it("does not allow hard-deleting catalog records (deactivate instead)", async () => {
    // Use a dedicated barber so other tests can keep selling with a.barberId.
    const { data: barber } = await a.client
      .from("barbers")
      .insert({ barbershop_id: a.shopId, name: "Leaving Soon", commission_rate: 0.3 })
      .select("id")
      .single();

    const { error } = await a.client.from("barbers").delete().eq("id", barber!.id);
    expect(error?.code).toBe("42501");
    const deactivate = await a.client.from("barbers").update({ active: false }).eq("id", barber!.id).select("active");
    expect(deactivate.data).toEqual([{ active: false }]);
  });
});
