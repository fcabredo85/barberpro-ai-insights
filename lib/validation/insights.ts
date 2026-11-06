import { z } from "zod";

import { RANGE_PRESETS } from "@/lib/business/report-range";

/**
 * Body of POST /api/ai/insights. Only a date range: no free-form prompt, no
 * barbershop id, no SQL. The server decides everything the model sees.
 */
export const insightsRequestSchema = z.strictObject(
  {
    range: z.enum(RANGE_PRESETS.map((p) => p.key) as [string, ...string[]]).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
  },
  { error: "Unexpected field in request." },
);

export type InsightsRequest = z.infer<typeof insightsRequestSchema>;
