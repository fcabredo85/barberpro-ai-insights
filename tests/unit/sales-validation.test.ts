import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { addDays, manilaDateRangeToUtc, manilaToday, rangeLengthDays } from "@/lib/business/dates";
import { barberFormSchema, serviceFormSchema } from "@/lib/validation/catalog";
import { createSaleSchema, dateRangeSchema, issuesByField } from "@/lib/validation/sales";

const validSale = () => ({
  barberId: randomUUID(),
  serviceId: randomUUID(),
  quantity: 2,
  paymentMethod: "cash",
  requestKey: randomUUID(),
});

describe("createSaleSchema (POST /api/sales body)", () => {
  it("accepts a valid cash or GCash sale", () => {
    expect(createSaleSchema.safeParse(validSale()).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...validSale(), paymentMethod: "gcash" }).success).toBe(true);
  });

  it.each(["card", "paypal", "CASH", "", null])("rejects payment method %j (no live payments)", (paymentMethod) => {
    const result = createSaleSchema.safeParse({ ...validSale(), paymentMethod });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesByField(result.error).paymentMethod).toMatch(/cash or GCash/);
  });

  it.each([0, 21, 1.5, -1, "2"])("rejects quantity %j", (quantity) => {
    expect(createSaleSchema.safeParse({ ...validSale(), quantity }).success).toBe(false);
  });

  it.each([
    ["unit price", { unit_price: 1 }],
    ["gross total", { grossTotal: 1 }],
    ["commission", { commissionAmount: 0 }],
    ["barbershop", { barbershopId: randomUUID() }],
  ])("rejects a client-supplied %s (server derives it)", (_label, extra) => {
    const result = createSaleSchema.safeParse({ ...validSale(), ...extra });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesByField(result.error).form).toBe("Unexpected field in request.");
  });

  it("requires a UUID request key for idempotency", () => {
    expect(createSaleSchema.safeParse({ ...validSale(), requestKey: "abc" }).success).toBe(false);
    const withoutKey: Partial<ReturnType<typeof validSale>> = validSale();
    delete withoutKey.requestKey;
    expect(createSaleSchema.safeParse(withoutKey).success).toBe(false);
  });

  it("rejects non-UUID barber and service ids", () => {
    const result = createSaleSchema.safeParse({ ...validSale(), barberId: "1", serviceId: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issuesByField(result.error)).toMatchObject({ barberId: "Choose a barber.", serviceId: "Choose a service." });
    }
  });
});

describe("catalog form validation", () => {
  it("converts a barber's percentage to basis points", () => {
    expect(barberFormSchema.parse({ name: " Paolo ", commissionRate: "40" })).toEqual({
      name: "Paolo",
      commissionRate: 4_000,
    });
  });

  it.each(["101", "-5", "abc", "", "12.345"])("rejects commission rate %j outside 0 to 100 percent", (commissionRate) => {
    const result = barberFormSchema.safeParse({ name: "Paolo", commissionRate });
    expect(result.success).toBe(false);
  });

  it("converts a service price to centavos", () => {
    expect(serviceFormSchema.parse({ name: "Haircut", price: "1,250.50" })).toEqual({ name: "Haircut", price: 125_050 });
  });

  it.each([
    ["zero", "0", "more than ₱0.00"],
    ["negative", "-250", "peso amount"],
    ["too many decimals", "1.005", "peso amount"],
    ["too large", "100000.01", "at most ₱100,000.00"],
  ])("rejects a %s price with an actionable message", (_label, price, message) => {
    const result = serviceFormSchema.safeParse({ name: "Haircut", price });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain(message);
  });

  it("rejects blank and overlong names", () => {
    expect(serviceFormSchema.safeParse({ name: "  ", price: "250" }).success).toBe(false);
    expect(barberFormSchema.safeParse({ name: "x".repeat(101), commissionRate: "40" }).success).toBe(false);
  });
});

describe("Manila date ranges", () => {
  it("maps a Manila calendar day to the correct UTC window (UTC+8)", () => {
    expect(manilaDateRangeToUtc("2026-11-06", "2026-11-06")).toEqual({
      startUtc: "2026-11-05T16:00:00.000Z",
      endUtc: "2026-11-06T16:00:00.000Z",
    });
  });

  it("treats 7:30 AM Manila on Nov 6 as Nov 6 even though it's still Nov 5 in UTC", () => {
    expect(manilaToday(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
  });

  it("counts inclusive days and shifts across month ends", () => {
    expect(rangeLengthDays("2026-11-01", "2026-11-07")).toBe(7);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates filter ranges", () => {
    expect(dateRangeSchema.safeParse({ from: "2026-11-01", to: "2026-11-07" }).success).toBe(true);
    expect(dateRangeSchema.safeParse({ from: "2026-11-07", to: "2026-11-01" }).success).toBe(false);
    expect(dateRangeSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
    expect(dateRangeSchema.safeParse({ from: "2024-01-01", to: "2026-01-01" }).success).toBe(false);
  });
});
