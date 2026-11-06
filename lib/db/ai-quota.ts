import "server-only";

import { z } from "zod";

import type { DbClient } from "@/lib/db/types";

const quotaSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true), remaining: z.number().int() }),
  z.object({
    allowed: z.literal(false),
    scope: z.enum(["user", "barbershop"]),
    retryAfterSeconds: z.number().int().positive(),
  }),
]);

export type QuotaResult = z.infer<typeof quotaSchema>;

/**
 * Atomically check and record one AI insight request against fixed limits
 * (per user per minute, per barbershop per hour), enforced in Postgres.
 */
export async function consumeAiInsightQuota(db: DbClient, barbershopId: string): Promise<QuotaResult> {
  const { data, error } = await db.rpc("consume_ai_insight_quota", { p_barbershop_id: barbershopId });
  if (error) throw new Error("Failed to check AI quota", { cause: error.code });
  const parsed = quotaSchema.safeParse(data);
  if (!parsed.success) throw new Error("AI quota response had an unexpected shape");
  return parsed.data;
}
