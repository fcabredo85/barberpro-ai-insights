import { describe, expect, it } from "vitest";

import { consumeAiInsightQuota } from "@/lib/db/ai-quota";

import { createOwnerWithShop, newClient } from "./supabase-test-env";

describe("AI insight rate limiting (consume_ai_insight_quota)", () => {
  it("allows 2 requests per user per minute, then blocks with a retry time", async () => {
    const { client, shop } = await createOwnerWithShop("quota-user");
    expect(await consumeAiInsightQuota(client, shop.id)).toEqual({ allowed: true, remaining: 9 });
    expect(await consumeAiInsightQuota(client, shop.id)).toEqual({ allowed: true, remaining: 8 });

    const third = await consumeAiInsightQuota(client, shop.id);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.scope).toBe("user");
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
      expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("tracks each barbershop separately", async () => {
    const a = await createOwnerWithShop("quota-a");
    const b = await createOwnerWithShop("quota-b");
    await consumeAiInsightQuota(a.client, a.shop.id);
    await consumeAiInsightQuota(a.client, a.shop.id);
    expect((await consumeAiInsightQuota(b.client, b.shop.id)).allowed).toBe(true);
  });

  it("refuses to count requests for a shop the caller doesn't belong to", async () => {
    const a = await createOwnerWithShop("quota-owner");
    const intruder = await createOwnerWithShop("quota-intruder");
    const { error } = await intruder.client.rpc("consume_ai_insight_quota", { p_barbershop_id: a.shop.id });
    expect(error?.code).toBe("42501");
  });

  it("is unavailable to signed-out callers", async () => {
    const a = await createOwnerWithShop("quota-anon");
    const { error } = await newClient().rpc("consume_ai_insight_quota", { p_barbershop_id: a.shop.id });
    expect(error?.code).toBe("42501");
  });

  it("does not let clients read or tamper with the request log directly", async () => {
    const { client, shop, userId } = await createOwnerWithShop("quota-direct");
    const read = await client.from("ai_insight_requests").select("id");
    expect(read.error?.code).toBe("42501");
    const del = await client.from("ai_insight_requests").delete().eq("barbershop_id", shop.id);
    expect(del.error?.code).toBe("42501");
    const ins = await client.from("ai_insight_requests").insert({ barbershop_id: shop.id, user_id: userId });
    expect(ins.error?.code).toBe("42501");
  });
});
