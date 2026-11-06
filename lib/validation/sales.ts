import { z } from "zod";

import { MAX_RANGE_DAYS, isValidIsoDate, rangeLengthDays } from "@/lib/business/dates";
import { MAX_QUANTITY, MIN_QUANTITY, PAYMENT_METHODS } from "@/lib/business/sale";

/**
 * Body of POST /api/sales. Strict: prices, totals, commission and the
 * barbershop are NEVER accepted from the client; the server derives them.
 */
export const createSaleSchema = z.strictObject(
  {
    barberId: z.uuid({ error: "Choose a barber." }),
    serviceId: z.uuid({ error: "Choose a service." }),
    quantity: z
      .number({ error: "Quantity must be a whole number." })
      .int({ error: "Quantity must be a whole number." })
      .min(MIN_QUANTITY, { error: `Quantity must be at least ${MIN_QUANTITY}.` })
      .max(MAX_QUANTITY, { error: `Quantity must be at most ${MAX_QUANTITY}.` }),
    paymentMethod: z.enum(PAYMENT_METHODS, { error: "Payment method must be cash or GCash." }),
    requestKey: z.uuid({ error: "Missing or invalid request key." }),
  },
  { error: "Unexpected field in request." },
);

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/** Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filter (Manila calendar dates). */
export const dateRangeSchema = z
  .object({
    from: z.string().refine(isValidIsoDate, { error: "Start date must be a valid date (YYYY-MM-DD)." }),
    to: z.string().refine(isValidIsoDate, { error: "End date must be a valid date (YYYY-MM-DD)." }),
  })
  .refine(({ from, to }) => !isValidIsoDate(from) || !isValidIsoDate(to) || to >= from, {
    error: "End date must be on or after the start date.",
    path: ["to"],
  })
  .refine(({ from, to }) => !isValidIsoDate(from) || !isValidIsoDate(to) || to < from || rangeLengthDays(from, to) <= MAX_RANGE_DAYS, {
    error: `Date range can be at most ${MAX_RANGE_DAYS} days.`,
    path: ["to"],
  });

export type DateRange = z.infer<typeof dateRangeSchema>;

/** Field-level messages from a Zod error, first message per field. */
export function issuesByField(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.code === "unrecognized_keys" ? "form" : String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
