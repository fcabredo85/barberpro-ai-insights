import { apiError, apiSuccess } from "@/lib/api/response";
import { authorizeWorkspace } from "@/lib/api/workspace-auth";
import { changeAppointmentStatus, type StatusResult } from "@/lib/db/appointments";
import { appointmentActionSchema } from "@/lib/validation/appointments";
import { lookIdSchema } from "@/lib/validation/looks";
import { issuesByField } from "@/lib/validation/sales";

const REJECTIONS: Record<Extract<StatusResult, { ok: false }>["reason"], { status: number; message: string }> = {
  not_found: { status: 404, message: "That appointment doesn't exist." },
  not_confirmed: { status: 409, message: "Only confirmed appointments can be changed." },
  too_early: { status: 400, message: "It's too early for that. Complete an appointment from 30 minutes before it starts; mark no-shows after the start time." },
  payment_method_required: { status: 400, message: "Choose how the customer paid." },
  catalog_inactive: { status: 409, message: "The barber or service has been deactivated, so a sale can't be recorded. Reactivate it in Settings first." },
};

/**
 * PATCH /api/appointments/:id  { action: "cancel" | "no_show" | "complete", paymentMethod? }
 * Completing records the sale in the same transaction (the appointment id is
 * the sale's request key, so it can never be recorded twice).
 *
 * 200 | 400 | 401 | 403 | 404 | 409 | 415
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!lookIdSchema.safeParse(id).success) return apiError(400, "VALIDATION_ERROR", "Invalid appointment id.");
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.");
    }
    const auth = await authorizeWorkspace("manage appointments");
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }
    const action = appointmentActionSchema.safeParse(body);
    if (!action.success) return apiError(400, "VALIDATION_ERROR", "Choose a valid action.", issuesByField(action.error));

    const result = await changeAppointmentStatus(auth.supabase, id, action.data);
    if (!result.ok) {
      const r = REJECTIONS[result.reason];
      return apiError(r.status, r.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", r.message);
    }
    return apiSuccess({ status: result.status, saleId: result.saleId ?? null });
  } catch (error) {
    console.error("[api/appointments/:id] update failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not update the appointment. Please try again.");
  }
}
