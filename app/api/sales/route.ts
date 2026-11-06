import { apiError, apiSuccess } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { createSale } from "@/lib/sales/create-sale";
import { toReceipt } from "@/lib/sales/receipt";
import { createSaleSchema, issuesByField } from "@/lib/validation/sales";

/**
 * POST /api/sales: record a completed service sale (payment already taken
 * outside the app as cash or GCash; no payment is processed here).
 *
 * 201 created | 200 idempotent replay | 400 invalid | 401 | 403 | 409 key reuse | 415 | 500
 */
export async function POST(request: Request) {
  try {
    // JSON only: also blocks cross-site "simple" form posts (CSRF) since a
    // cross-origin JSON request requires a CORS preflight we never allow.
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the sale as JSON.");
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to record sales.");

    // Tenant comes from the verified membership, never from the request body.
    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Check the sale details and try again.", issuesByField(parsed.error));
    }

    const result = await createSale(supabase, workspace.barbershopId, parsed.data);
    switch (result.kind) {
      case "created":
        return apiSuccess(toReceipt(result.sale), 201, { Location: `/sales/${result.sale.id}` });
      case "replayed":
        return apiSuccess(toReceipt(result.sale), 200, { "Idempotent-Replayed": "true" });
      case "conflict":
        return apiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This request key was already used for a different sale. Start a new sale and try again.",
        );
      case "invalid_selection":
        return apiError(
          400,
          "INVALID_SELECTION",
          result.field === "barberId"
            ? "That barber isn't available. Choose an active barber."
            : "That service isn't available. Choose an active service.",
          { [result.field]: "Not available in your barbershop." },
        );
      default:
        return apiError(500, "INTERNAL_ERROR", "Could not record the sale. Please try again.");
    }
  } catch (error) {
    // Log the error kind only; never the request body or tokens.
    console.error("[api/sales] unexpected error:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not record the sale. Please try again.");
  }
}
