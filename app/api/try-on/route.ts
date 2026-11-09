import { getTryOnImageModel } from "@/lib/ai/image-model";
import { apiError, apiSuccess } from "@/lib/api/response";
import { finishAiJob, startAiJob, type StartJobResult } from "@/lib/db/ai-jobs";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { generateTryOnPreview, type PreviewFailure } from "@/lib/tryon/generate-preview";
import { SIMULATION_DISCLAIMER } from "@/lib/tryon/consent";
import { MAX_UPLOAD_BYTES, validateImageBytes } from "@/lib/tryon/image-validation";
import { getHairstyle } from "@/lib/tryon/styles";
import { issuesByField } from "@/lib/validation/sales";
import { tryOnFieldsSchema, type TryOnResponse } from "@/lib/validation/tryon";

// Image edits commonly take 20-60s. The provider timeout (90s) stays below this.
// Requires a Vercel plan/runtime that allows 120s functions; verify before deploy.
export const maxDuration = 120;

/** Multipart overhead allowance on top of the photo itself. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

function rateLimitResponse(result: Extract<StartJobResult, { allowed: false; retryAfterSeconds: number }>) {
  let message: string;
  if (result.reason === "concurrent") {
    message = "A preview is already being generated. Wait for it to finish before starting another.";
  } else if (result.scope === "user_minute") {
    message = "You're generating previews too quickly. Please wait a minute and try again.";
  } else if (result.scope === "user_day") {
    message = "You've reached today's preview limit. Try again tomorrow.";
  } else {
    message = "This barbershop has reached today's preview limit. Try again tomorrow.";
  }
  const res = apiError(429, "RATE_LIMITED", message);
  res.headers.set("Retry-After", String(result.retryAfterSeconds));
  return res;
}

function failureResponse(failure: PreviewFailure) {
  switch (failure) {
    case "timeout":
      return apiError(503, "AI_TIMEOUT", "The preview took too long to generate. Please try again.");
    case "refused":
      return apiError(
        422,
        "AI_REFUSED",
        "The AI service couldn't create a preview from this photo. Try a clear, front-facing selfie of one person.",
      );
    case "provider_rate_limited":
      return apiError(503, "AI_UNAVAILABLE", "The AI service is busy right now. Please try again in a few minutes.");
    case "malformed_response":
      return apiError(502, "AI_INVALID_OUTPUT", "The AI service returned an unusable result. Please try again.");
    default:
      return apiError(502, "AI_UNAVAILABLE", "The AI service is unavailable right now. Please try again shortly.");
  }
}

/**
 * POST /api/try-on  (multipart/form-data)
 *   photo, styleId, consent="granted", consentNoticeVersion, requestKey (uuid)
 *
 * Order matters: authenticate -> validate input and consent -> validate file
 * content -> record consent + check quotas (DB) -> ONLY THEN call the provider.
 * The photo and preview are never stored or logged.
 *
 * 200 | 400 | 401 | 403 | 409 | 411 | 413 | 415 | 422 | 429 | 502 | 503
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the photo as multipart form data.");
    }
    // Require a declared size so an unbounded (chunked) body is never buffered.
    const lengthHeader = request.headers.get("content-length");
    const declaredLength = Number(lengthHeader);
    if (!lengthHeader || !Number.isFinite(declaredLength) || declaredLength <= 0) {
      return apiError(411, "VALIDATION_ERROR", "The upload is missing its size. Please try again.");
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return apiError(413, "PAYLOAD_TOO_LARGE", "Photos must be 8 MB or smaller.");
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to use the Virtual Try-On Studio.");

    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(400, "VALIDATION_ERROR", "The upload couldn't be read. Please try again.");
    }

    const fields = tryOnFieldsSchema.safeParse({
      styleId: form.get("styleId") ?? undefined,
      consent: form.get("consent") ?? undefined,
      consentNoticeVersion: form.get("consentNoticeVersion") ?? undefined,
      requestKey: form.get("requestKey") ?? undefined,
    });
    if (!fields.success) {
      const byField = issuesByField(fields.error);
      const consentProblem = byField.consent ?? byField.consentNoticeVersion;
      if (consentProblem) return apiError(400, "CONSENT_REQUIRED", consentProblem, byField);
      return apiError(400, "VALIDATION_ERROR", "Check the request and try again.", byField);
    }

    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return apiError(400, "INVALID_UPLOAD", "Choose a photo to upload.", { photo: "Choose a photo to upload." });
    }
    if (photo.size > MAX_UPLOAD_BYTES) {
      return apiError(413, "PAYLOAD_TOO_LARGE", "Photos must be 8 MB or smaller.");
    }
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const image = validateImageBytes(bytes, photo.type);
    if (!image.ok) {
      const status = image.reason === "too_large" ? 413 : 400;
      return apiError(status, status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_UPLOAD", image.message, { photo: image.message });
    }

    const imageModel = getTryOnImageModel();
    if (!imageModel) {
      return apiError(503, "AI_NOT_CONFIGURED", "AI previews aren't available right now. Nothing was sent or saved.");
    }

    const style = getHairstyle(fields.data.styleId);
    const job = await startAiJob(supabase, {
      barbershopId: workspace.barbershopId,
      feature: "tryon_preview",
      requestKey: fields.data.requestKey,
      model: imageModel.modelId,
      styleId: style.id,
      consentNoticeVersion: fields.data.consentNoticeVersion,
    });
    if (!job.allowed) {
      if (job.reason === "consent_required") {
        return apiError(400, "CONSENT_REQUIRED", "Consent to photo processing is required.");
      }
      if (job.reason === "duplicate_request") {
        return apiError(409, "IDEMPOTENCY_CONFLICT", "This preview request was already submitted. Start a new preview to try again.");
      }
      return rateLimitResponse(job);
    }

    const started = Date.now();
    const result = await generateTryOnPreview({ bytes, mediaType: image.mediaType }, style, { model: imageModel.model });
    const durationMs = Date.now() - started;

    if (result.kind === "error") {
      await finishAiJob(supabase, job.jobId, { status: "failed", errorCode: result.failure }, durationMs);
      // Category and job id only: never the photo, prompt or provider body.
      console.warn(`[api/try-on] job ${job.jobId} failed: ${result.failure} after ${durationMs}ms`);
      return failureResponse(result.failure);
    }

    await finishAiJob(supabase, job.jobId, { status: "succeeded" }, durationMs);

    const payload: TryOnResponse = {
      status: "ok",
      jobId: job.jobId,
      styleId: style.id,
      styleName: style.name,
      preview: {
        dataUrl: `data:${result.image.mediaType};base64,${result.image.base64}`,
        mediaType: result.image.mediaType,
      },
      label: "AI-generated simulation",
      disclaimer: SIMULATION_DISCLAIMER,
      generatedAt: new Date().toISOString(),
    };
    // apiSuccess sets Cache-Control: no-store; private personal image data must not be cached.
    return apiSuccess(payload, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("[api/try-on] unexpected error:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not generate the preview. Please try again.");
  }
}
