import { apiError, apiSuccess } from "@/lib/api/response";
import { deleteSavedLook, getSavedLook } from "@/lib/db/looks";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { lookIdSchema } from "@/lib/validation/looks";

/**
 * DELETE /api/looks/:id: removes the stored photos, then the record, and marks
 * the customer's storage consent revoked (FR-15). Members of the owning shop
 * only; anyone else gets a non-disclosing 404.
 *
 * 200 | 400 | 401 | 403 | 404 | 503
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!lookIdSchema.safeParse(id).success) return apiError(400, "VALIDATION_ERROR", "Invalid look id.");

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to manage saved looks.");
    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");

    // RLS returns nothing for other shops' looks.
    const look = await getSavedLook(supabase, id);
    if (!look) return apiError(404, "NOT_FOUND", "That saved look doesn't exist or was already deleted.");

    const outcome = await deleteSavedLook(supabase, look);
    if (outcome === "storage_error") {
      return apiError(503, "STORAGE_UNAVAILABLE", "The look couldn't be fully deleted right now. Please try again.");
    }
    if (outcome === "not_found") return apiError(404, "NOT_FOUND", "That saved look doesn't exist or was already deleted.");
    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("[api/looks/:id] delete failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not delete the look. Please try again.");
  }
}
