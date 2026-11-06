import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/response";
import { getSalesReport } from "@/lib/db/metrics";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { parseReportRange } from "@/lib/validation/report-range";

/**
 * GET /api/metrics?range=today|7d|30d|90d  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Server-calculated aggregates for the caller's own barbershop. Dates are
 * Asia/Manila calendar days; money is integer centavos.
 * 200 | 400 invalid dates | 401 | 403 | 500
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to view metrics.");

    // Tenant is resolved from the verified membership; no barbershop parameter is accepted.
    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");

    const search = request.nextUrl.searchParams;
    const range = parseReportRange({ from: search.get("from"), to: search.get("to"), range: search.get("range") });
    if (!range.ok) return apiError(400, "VALIDATION_ERROR", "Check the date range and try again.", range.fields);

    const report = await getSalesReport(supabase, workspace.barbershopId, range.from, range.to);
    return apiSuccess(report);
  } catch (error) {
    console.error("[api/metrics] unexpected error:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not load metrics. Please try again.");
  }
}
