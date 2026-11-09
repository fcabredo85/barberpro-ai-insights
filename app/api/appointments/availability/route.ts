import { apiError, apiSuccess } from "@/lib/api/response";
import { authorizeWorkspace } from "@/lib/api/workspace-auth";
import { getAvailableSlots } from "@/lib/db/appointments";
import { availabilityQuerySchema } from "@/lib/validation/appointments";
import { issuesByField } from "@/lib/validation/sales";

/**
 * GET /api/appointments/availability?barberId=&serviceId=&date=YYYY-MM-DD
 * Genuinely free start times, computed in the database from opening hours,
 * service duration and existing bookings. 200 | 400 | 401 | 403
 */
export async function GET(request: Request) {
  try {
    const auth = await authorizeWorkspace("book appointments");
    if (!auth.ok) return auth.response;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = availabilityQuerySchema.safeParse(params);
    if (!query.success) return apiError(400, "VALIDATION_ERROR", "Choose a barber, service and date.", issuesByField(query.error));

    const slots = await getAvailableSlots(auth.supabase, auth.workspace.barbershopId, query.data.barberId, query.data.serviceId, query.data.date);
    return apiSuccess({ date: query.data.date, slots });
  } catch (error) {
    console.error("[api/appointments/availability] failed:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not load available times. Please try again.");
  }
}
