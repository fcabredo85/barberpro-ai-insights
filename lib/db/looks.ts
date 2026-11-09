import "server-only";

import { z } from "zod";

import type { DbClient } from "@/lib/db/types";
import type { AcceptedMediaType } from "@/lib/tryon/image-validation";
import { getHairstyle, isHairstyleId } from "@/lib/tryon/styles";
import type { SavedLookView } from "@/lib/validation/looks";

/** Private bucket; see migration 20261108020000_saved_looks_storage.sql. */
export const LOOKS_BUCKET = "images";

/** Signed URLs are short-lived; pages re-sign on every render. */
export const SIGNED_URL_SECONDS = 300;

const EXTENSIONS: Record<AcceptedMediaType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function lookObjectPaths(barbershopId: string, lookId: string, original: AcceptedMediaType, preview: AcceptedMediaType) {
  return {
    originalPath: `${barbershopId}/${lookId}/original.${EXTENSIONS[original]}`,
    previewPath: `${barbershopId}/${lookId}/preview.${EXTENSIONS[preview]}`,
  };
}

// ---------------------------------------------------------------------------
// Storage (runs as the signed-in user, so bucket policies apply)
// ---------------------------------------------------------------------------

export async function uploadLookImage(db: DbClient, path: string, bytes: Uint8Array, contentType: AcceptedMediaType) {
  const { error } = await db.storage.from(LOOKS_BUCKET).upload(path, bytes, { contentType, upsert: false, cacheControl: "0" });
  if (error) throw new Error("Failed to upload look image", { cause: error.name });
}

/** Removing missing objects is a no-op, so this is safe to retry. */
export async function removeLookImages(db: DbClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await db.storage.from(LOOKS_BUCKET).remove(paths);
  if (error) {
    console.error(`[looks] storage remove failed (${error.name})`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** The caller's own successful try-on job, if any (RLS limits jobs to their owner). */
export async function findSavableJob(db: DbClient, jobId: string, barbershopId: string) {
  const { data, error } = await db
    .from("ai_generation_jobs")
    .select("id, style_id")
    .eq("id", jobId)
    .eq("barbershop_id", barbershopId)
    .eq("feature", "tryon_preview")
    .eq("status", "succeeded")
    .maybeSingle();
  if (error) throw new Error("Failed to load try-on job", { cause: error.code });
  return data;
}

export async function findLookIdForJob(db: DbClient, jobId: string): Promise<string | null> {
  const { data, error } = await db.from("saved_looks").select("id").eq("tryon_job_id", jobId).maybeSingle();
  if (error) throw new Error("Failed to check saved looks", { cause: error.code });
  return data?.id ?? null;
}

const createResultSchema = z.union([
  z.object({ ok: z.literal(true), lookId: z.uuid(), duplicate: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.enum(["consent_required", "invalid_job"]) }),
]);

export type CreateLookResult = z.infer<typeof createResultSchema>;

export async function createSavedLook(
  db: DbClient,
  input: {
    lookId: string;
    barbershopId: string;
    tryOnJobId: string;
    customerLabel: string;
    title?: string;
    originalPath: string;
    previewPath: string;
    noticeVersion: string;
  },
): Promise<CreateLookResult> {
  const { data, error } = await db.rpc("create_saved_look", {
    p_look_id: input.lookId,
    p_barbershop_id: input.barbershopId,
    p_tryon_job_id: input.tryOnJobId,
    p_customer_label: input.customerLabel,
    p_title: input.title ?? "",
    p_original_path: input.originalPath,
    p_preview_path: input.previewPath,
    p_notice_version: input.noticeVersion,
  });
  if (error) throw new Error("Failed to save look", { cause: error.code });
  const parsed = createResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("Save look response had an unexpected shape");
  return parsed.data;
}

interface LookRow {
  id: string;
  customer_label: string;
  title: string | null;
  style_id: string;
  original_path: string;
  preview_path: string;
  created_at: string;
  delete_after: string;
}

const LOOK_COLUMNS = "id, customer_label, title, style_id, original_path, preview_path, created_at, delete_after";

export async function getSavedLook(db: DbClient, lookId: string): Promise<LookRow | null> {
  const { data, error } = await db.from("saved_looks").select(LOOK_COLUMNS).eq("id", lookId).maybeSingle();
  if (error) throw new Error("Failed to load saved look", { cause: error.code });
  return data;
}

/**
 * Delete a look: storage objects FIRST, then the record (which also marks the
 * storage consent revoked). If object removal fails the record stays, so the
 * deletion can be retried and no orphaned photos remain.
 */
export async function deleteSavedLook(db: DbClient, look: Pick<LookRow, "id" | "original_path" | "preview_path">): Promise<"deleted" | "not_found" | "storage_error"> {
  const removed = await removeLookImages(db, [look.original_path, look.preview_path]);
  if (!removed) return "storage_error";
  const { data, error } = await db.rpc("delete_saved_look", { p_look_id: look.id });
  if (error) throw new Error("Failed to delete saved look", { cause: error.code });
  return data ? "deleted" : "not_found";
}

/**
 * Retention: delete this shop's expired looks. Runs opportunistically when
 * looks are listed (there is no service-role scheduler in this app), and is
 * bounded per call. Returns how many were purged.
 */
export async function purgeExpiredLooks(db: DbClient, barbershopId: string, limit = 25): Promise<number> {
  const { data, error } = await db
    .from("saved_looks")
    .select("id, original_path, preview_path")
    .eq("barbershop_id", barbershopId)
    .lte("delete_after", new Date().toISOString())
    .limit(limit);
  if (error) throw new Error("Failed to find expired looks", { cause: error.code });
  let purged = 0;
  for (const look of data) if ((await deleteSavedLook(db, look)) === "deleted") purged++;
  return purged;
}

/** List the shop's unexpired looks, newest first, with short-lived signed URLs. */
export async function listSavedLooks(db: DbClient, barbershopId: string, limit = 50): Promise<SavedLookView[]> {
  const { data, error } = await db
    .from("saved_looks")
    .select(LOOK_COLUMNS)
    .eq("barbershop_id", barbershopId)
    .gt("delete_after", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Failed to list saved looks", { cause: error.code });
  if (data.length === 0) return [];

  const paths = data.flatMap((row) => [row.original_path, row.preview_path]);
  const signed = await db.storage.from(LOOKS_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urlByPath = new Map<string, string>();
  if (!signed.error) {
    for (const item of signed.data) if (item.path && item.signedUrl && !item.error) urlByPath.set(item.path, item.signedUrl);
  } else {
    console.error(`[looks] signing failed (${signed.error.name})`);
  }

  return data.map((row) => ({
    id: row.id,
    customerLabel: row.customer_label,
    title: row.title,
    styleId: row.style_id,
    styleName: isHairstyleId(row.style_id) ? getHairstyle(row.style_id).name : row.style_id,
    createdAt: row.created_at,
    deleteAfter: row.delete_after,
    originalUrl: urlByPath.get(row.original_path) ?? null,
    previewUrl: urlByPath.get(row.preview_path) ?? null,
  }));
}

/** One unexpired look with a short-lived signed preview URL (for the booking page). */
export async function getSavedLookForBooking(db: DbClient, lookId: string) {
  const { data, error } = await db
    .from("saved_looks")
    .select("id, customer_label, style_id, preview_path")
    .eq("id", lookId)
    .gt("delete_after", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("Failed to load saved look", { cause: error.code });
  if (!data) return null;
  const signed = await db.storage.from(LOOKS_BUCKET).createSignedUrl(data.preview_path, SIGNED_URL_SECONDS);
  return {
    id: data.id,
    customerLabel: data.customer_label,
    styleName: isHairstyleId(data.style_id) ? getHairstyle(data.style_id).name : data.style_id,
    previewUrl: signed.error ? null : signed.data.signedUrl,
  };
}
