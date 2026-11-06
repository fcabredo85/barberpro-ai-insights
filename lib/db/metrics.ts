import "server-only";

import { manilaDateRangeToUtc } from "@/lib/business/dates";
import { buildSalesReport, type SalesReport } from "@/lib/business/metrics";
import type { DbClient } from "@/lib/db/types";
import { salesAggregatesSchema } from "@/lib/validation/metrics";

/**
 * Sales report for one barbershop and an inclusive Asia/Manila date range.
 * Aggregation happens in Postgres (exact numeric sums, Manila day buckets,
 * caller's RLS applies); the result is validated, then shaped in TypeScript.
 *
 * @param barbershopId Derived server-side from the caller's membership.
 */
export async function getSalesReport(
  db: DbClient,
  barbershopId: string,
  from: string,
  to: string,
): Promise<SalesReport> {
  const { startUtc, endUtc } = manilaDateRangeToUtc(from, to);
  const { data, error } = await db.rpc("sales_report", {
    p_barbershop_id: barbershopId,
    p_start: startUtc,
    p_end: endUtc,
  });
  if (error) throw new Error("Failed to load sales report", { cause: error.code });

  const parsed = salesAggregatesSchema.safeParse(data);
  if (!parsed.success) throw new Error("Sales report had an unexpected shape");

  return buildSalesReport(parsed.data, from, to);
}
