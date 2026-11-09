import { generateAdvice } from "@/lib/advisor/generate-advice";
import { ADVICE_DISCLAIMER, adviceRequestSchema } from "@/lib/advisor/schema";
import { getInsightsModel } from "@/lib/ai/model";
import { apiError, apiSuccess } from "@/lib/api/response";
import { finishAiJob, startAiJob } from "@/lib/db/ai-jobs";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { getHairstyle } from "@/lib/tryon/styles";
import { issuesByField } from "@/lib/validation/sales";

export const maxDuration = 60;

/**
 * POST /api/hairstyle-advice  { preferences: {...}, requestKey }
 *
 * Authenticated, quota-limited, preference-only advice (PRD FR-19). Returns
 * 3-5 validated catalog recommendations. No photo is sent to the model.
 *
 * 200 | 400 | 401 | 403 | 409 | 415 | 429 | 503
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.");
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to get hairstyle advice.");

    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }
    const parsed = adviceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Check your answers and try again.", issuesByField(parsed.error));
    }

    const textModel = getInsightsModel();
    if (!textModel) {
      return apiError(503, "AI_NOT_CONFIGURED", "The hairstyle advisor isn't available right now. You can still pick a style yourself.");
    }

    const job = await startAiJob(supabase, {
      barbershopId: workspace.barbershopId,
      feature: "hairstyle_advice",
      requestKey: parsed.data.requestKey,
      model: textModel.modelId,
    });
    if (!job.allowed) {
      if (job.reason === "duplicate_request") {
        return apiError(409, "IDEMPOTENCY_CONFLICT", "This request was already submitted. Please try again.");
      }
      if (job.reason === "consent_required") {
        // Not expected for advice (no photo); treat defensively as a server error.
        throw new Error("Unexpected consent requirement for advice");
      }
      const res = apiError(
        429,
        "RATE_LIMITED",
        job.reason === "concurrent"
          ? "Another AI request is still running. Please wait a moment."
          : "You've asked for advice too often. Please wait and try again.",
      );
      res.headers.set("Retry-After", String(job.retryAfterSeconds));
      return res;
    }

    const started = Date.now();
    const result = await generateAdvice(parsed.data.preferences, { model: textModel.model });
    const durationMs = Date.now() - started;

    if (result.kind !== "ok") {
      await finishAiJob(supabase, job.jobId, { status: "failed", errorCode: result.kind }, durationMs);
      if (result.kind === "invalid_output") {
        console.warn(`[api/hairstyle-advice] rejected model output (${result.problems.length} problem(s))`);
        return apiError(503, "AI_INVALID_OUTPUT", "The advisor's answer didn't pass our checks. Please try again.");
      }
      if (result.kind === "timeout") {
        return apiError(503, "AI_TIMEOUT", "The advisor took too long to respond. Please try again.");
      }
      return apiError(503, "AI_UNAVAILABLE", "The advisor is unavailable right now. Please try again shortly.");
    }

    await finishAiJob(supabase, job.jobId, { status: "succeeded" }, durationMs);
    return apiSuccess({
      status: "ok" as const,
      recommendations: result.advice.recommendations.map((r) => ({
        styleId: r.styleId,
        styleName: getHairstyle(r.styleId).name,
        reason: r.reason,
      })),
      caveat: result.advice.caveat,
      disclaimer: ADVICE_DISCLAIMER,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/hairstyle-advice] unexpected error:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not get hairstyle advice. Please try again.");
  }
}
