import { apiSuccess } from "@/lib/api/response";

// Always evaluated per request; never statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/health: public liveness check (spec §6).
 * Reports only that the web app is up. No version, environment, database,
 * dependency or configuration details are exposed.
 */
export function GET() {
  return apiSuccess({ status: "ok", service: "barberpro-ai", time: new Date().toISOString() });
}
