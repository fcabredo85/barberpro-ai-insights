import { randomUUID } from "node:crypto";

import { apiError, apiSuccess } from "@/lib/api/response";
import {
  createSavedLook,
  findLookIdForJob,
  findSavableJob,
  listSavedLooks,
  lookObjectPaths,
  purgeExpiredLooks,
  removeLookImages,
  uploadLookImage,
} from "@/lib/db/looks";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { MAX_UPLOAD_BYTES, validateImageBytes } from "@/lib/tryon/image-validation";
import { saveLookFieldsSchema } from "@/lib/validation/looks";
import { issuesByField } from "@/lib/validation/sales";

/** Two photos plus multipart overhead. */
const MAX_BODY_BYTES = 2 * MAX_UPLOAD_BYTES + 64 * 1024;

async function authorize() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, response: apiError(401, "UNAUTHENTICATED", "Sign in to manage saved looks.") };
  const workspace = await findWorkspaceForUser(supabase, user.id);
  if (!workspace) return { ok: false as const, response: apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.") };
  return { ok: true as const, supabase, workspace };
}

async function readImage(form: FormData, field: "original" | "preview") {
  const file = form.get(field);
  if (!(file instanceof File)) return { ok: false as const, message: `Missing ${field} image.` };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false as const, tooLarge: true, message: "Photos must be 8 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = validateImageBytes(bytes, file.type);
  if (!result.ok) return { ok: false as const, tooLarge: result.reason === "too_large", message: result.message };
  return { ok: true as const, bytes, mediaType: result.mediaType };
}

/**
 * GET /api/looks: this shop's saved looks (newest first) with 5-minute signed
 * URLs. Expired looks are purged first (retention).
 */
export async function GET() {
  try {
    const auth = await authorize();
    if (!auth.ok) return auth.response;
    await purgeExpiredLooks(auth.supabase, auth.workspace.barbershopId);
    const looks = await listSavedLooks(auth.supabase, auth.workspace.barbershopId);
    return apiSuccess({ looks }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("[api/looks] list failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not load saved looks. Please try again.");
  }
}

/**
 * POST /api/looks  (multipart/form-data)
 *   original, preview, tryOnJobId, customerLabel, title?, storageConsent="granted", storageNoticeVersion
 *
 * Saves a generated preview and its original photo to the private `images`
 * bucket with a separate, recorded storage consent (FR-13). Idempotent per
 * try-on job. The style is taken from the server-recorded job, not the client.
 *
 * 200 duplicate | 201 | 400 | 401 | 403 | 411 | 413 | 415 | 503
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload the look as multipart form data.");
    }
    const lengthHeader = request.headers.get("content-length");
    const declaredLength = Number(lengthHeader);
    if (!lengthHeader || !Number.isFinite(declaredLength) || declaredLength <= 0) {
      return apiError(411, "VALIDATION_ERROR", "The upload is missing its size. Please try again.");
    }
    if (declaredLength > MAX_BODY_BYTES) return apiError(413, "PAYLOAD_TOO_LARGE", "The photos are too large to save.");

    const auth = await authorize();
    if (!auth.ok) return auth.response;
    const { supabase, workspace } = auth;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(400, "VALIDATION_ERROR", "The upload couldn't be read. Please try again.");
    }

    const fields = saveLookFieldsSchema.safeParse({
      tryOnJobId: form.get("tryOnJobId") ?? undefined,
      customerLabel: form.get("customerLabel") ?? undefined,
      title: form.get("title") ?? undefined,
      storageConsent: form.get("storageConsent") ?? undefined,
      storageNoticeVersion: form.get("storageNoticeVersion") ?? undefined,
    });
    if (!fields.success) {
      const byField = issuesByField(fields.error);
      const consentProblem = byField.storageConsent ?? byField.storageNoticeVersion;
      if (consentProblem) return apiError(400, "CONSENT_REQUIRED", consentProblem, byField);
      return apiError(400, "VALIDATION_ERROR", "Check the form and try again.", byField);
    }

    // Cheap checks before uploading anything: the preview must be this user's
    // successful job for this shop, and saving the same preview twice is a no-op.
    const job = await findSavableJob(supabase, fields.data.tryOnJobId, workspace.barbershopId);
    if (!job) return apiError(400, "INVALID_SELECTION", "This preview can't be saved. Generate it again.");
    const existing = await findLookIdForJob(supabase, job.id);
    if (existing) return apiSuccess({ lookId: existing, duplicate: true });

    const original = await readImage(form, "original");
    const preview = await readImage(form, "preview");
    for (const image of [original, preview]) {
      if (!image.ok) {
        return image.tooLarge
          ? apiError(413, "PAYLOAD_TOO_LARGE", image.message)
          : apiError(400, "INVALID_UPLOAD", image.message);
      }
    }
    if (!original.ok || !preview.ok) throw new Error("unreachable");

    const lookId = randomUUID();
    const { originalPath, previewPath } = lookObjectPaths(workspace.barbershopId, lookId, original.mediaType, preview.mediaType);

    try {
      await uploadLookImage(supabase, originalPath, original.bytes, original.mediaType);
      await uploadLookImage(supabase, previewPath, preview.bytes, preview.mediaType);
    } catch {
      await removeLookImages(supabase, [originalPath, previewPath]);
      return apiError(503, "STORAGE_UNAVAILABLE", "The look couldn't be saved right now. Please try again.");
    }

    let result;
    try {
      result = await createSavedLook(supabase, {
        lookId,
        barbershopId: workspace.barbershopId,
        tryOnJobId: job.id,
        customerLabel: fields.data.customerLabel,
        title: fields.data.title,
        originalPath,
        previewPath,
        noticeVersion: fields.data.storageNoticeVersion,
      });
    } catch (error) {
      await removeLookImages(supabase, [originalPath, previewPath]);
      throw error;
    }

    if (!result.ok) {
      await removeLookImages(supabase, [originalPath, previewPath]);
      return result.reason === "consent_required"
        ? apiError(400, "CONSENT_REQUIRED", "The customer's consent to store the photos is required.")
        : apiError(400, "INVALID_SELECTION", "This preview can't be saved. Generate it again.");
    }
    if (result.duplicate) {
      // A concurrent request saved this preview first; drop our copies.
      await removeLookImages(supabase, [originalPath, previewPath]);
      return apiSuccess({ lookId: result.lookId, duplicate: true });
    }
    return apiSuccess({ lookId: result.lookId, duplicate: false }, 201);
  } catch (error) {
    console.error("[api/looks] save failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not save the look. Please try again.");
  }
}
