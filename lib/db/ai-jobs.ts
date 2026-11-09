import "server-only";

import { z } from "zod";

import type { Database } from "@/lib/db/database.types";
import type { DbClient } from "@/lib/db/types";

export type AiFeature = Database["public"]["Enums"]["ai_feature"];

const startJobSchema = z.union([
  z.object({ allowed: z.literal(true), jobId: z.uuid(), consentId: z.uuid().nullable() }),
  z.object({ allowed: z.literal(false), reason: z.literal("consent_required") }),
  z.object({ allowed: z.literal(false), reason: z.literal("duplicate_request"), status: z.enum(["pending", "succeeded", "failed"]) }),
  z.object({ allowed: z.literal(false), reason: z.literal("concurrent"), retryAfterSeconds: z.number().int().positive() }),
  z.object({
    allowed: z.literal(false),
    reason: z.literal("rate_limited"),
    scope: z.enum(["user_minute", "user_day", "barbershop_day"]),
    retryAfterSeconds: z.number().int().positive(),
  }),
]);

export type StartJobResult = z.infer<typeof startJobSchema>;

export interface StartJobInput {
  barbershopId: string;
  feature: AiFeature;
  requestKey: string;
  model: string;
  styleId?: string;
  /** Required for photo processing; recorded atomically with the job. */
  consentNoticeVersion?: string;
}

/**
 * Atomically (in Postgres) check membership, consent, idempotency,
 * concurrency and quotas, then record consent and a pending job. Must be
 * called and succeed BEFORE any data is sent to the AI provider.
 */
export async function startAiJob(db: DbClient, input: StartJobInput): Promise<StartJobResult> {
  const { data, error } = await db.rpc("start_ai_job", {
    p_barbershop_id: input.barbershopId,
    p_feature: input.feature,
    p_request_key: input.requestKey,
    p_model: input.model,
    p_style_id: input.styleId,
    p_consent_notice_version: input.consentNoticeVersion,
  });
  if (error) throw new Error("Failed to start AI job", { cause: error.code });
  const parsed = startJobSchema.safeParse(data);
  if (!parsed.success) throw new Error("AI job response had an unexpected shape");
  return parsed.data;
}

/**
 * Record the outcome. Best effort: a failure here must not hide a successful
 * preview from the user, so errors are logged by code only.
 */
export async function finishAiJob(
  db: DbClient,
  jobId: string,
  outcome: { status: "succeeded" } | { status: "failed"; errorCode: string },
  durationMs: number,
): Promise<void> {
  const { error } = await db.rpc("finish_ai_job", {
    p_job_id: jobId,
    p_status: outcome.status,
    p_error_code: outcome.status === "failed" ? outcome.errorCode : undefined,
    p_duration_ms: Math.max(0, Math.round(durationMs)),
  });
  if (error) console.error(`[ai-jobs] could not finish job (code ${error.code ?? "unknown"})`);
}
