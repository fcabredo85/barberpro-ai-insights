import { apiError, apiSuccess } from "@/lib/api/response";
import { authorizeWorkspace } from "@/lib/api/workspace-auth";
import { bookAppointment, type BookResult } from "@/lib/db/appointments";
import { bookAppointmentSchema } from "@/lib/validation/appointments";
import { issuesByField } from "@/lib/validation/sales";

const REJECTIONS: Record<Extract<BookResult, { ok: false }>["reason"], { status: number; field?: string; message: string }> = {
  invalid_barber: { status: 400, field: "barberId", message: "That barber isn't available for booking." },
  invalid_service: { status: 400, field: "serviceId", message: "That service isn't available for booking." },
  invalid_look: { status: 400, field: "savedLookId", message: "That saved look no longer exists." },
  in_past: { status: 400, field: "startsAt", message: "That time has already passed. Choose another time." },
  too_far_ahead: { status: 400, field: "startsAt", message: "Bookings can be made up to 60 days ahead." },
  not_on_slot: { status: 400, field: "startsAt", message: "Choose one of the listed times." },
  outside_hours: { status: 400, field: "startsAt", message: "The shop takes bookings from 10:00 AM to 9:00 PM." },
  slot_taken: { status: 409, field: "startsAt", message: "That time was just booked. Choose another time." },
  invalid_details: { status: 400, message: "Check the customer details and try again." },
};

/**
 * POST /api/appointments: book a CONFIRMED appointment. The database checks
 * barber, service, opening hours and overlaps atomically; the response says
 * "confirmed" only after the row exists. Idempotent per requestKey.
 *
 * 201 | 200 (replay) | 400 | 401 | 403 | 409 | 415
 */
export async function POST(request: Request) {
  try {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.");
    }
    const auth = await authorizeWorkspace("book appointments");
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }
    const parsed = bookAppointmentSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Check the booking details and try again.", issuesByField(parsed.error));

    const result = await bookAppointment(auth.supabase, auth.workspace.barbershopId, parsed.data);
    if (!result.ok) {
      const r = REJECTIONS[result.reason];
      return apiError(r.status, r.status === 409 ? "IDEMPOTENCY_CONFLICT" : "INVALID_SELECTION", r.message, r.field ? { [r.field]: r.message } : undefined);
    }
    const appointment = {
      appointmentId: result.appointmentId,
      status: result.status,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      duplicate: result.duplicate,
    };
    return apiSuccess(appointment, result.duplicate ? 200 : 201);
  } catch (error) {
    console.error("[api/appointments] booking failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not book the appointment. Nothing was booked; please try again.");
  }
}
