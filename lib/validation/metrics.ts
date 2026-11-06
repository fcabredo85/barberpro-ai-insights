import { z } from "zod";

import { decimalToCentavos } from "@/lib/business/money";
import type { RawSalesAggregates } from "@/lib/business/metrics";

/** Exact decimal text from Postgres (e.g. "1250.50") -> integer centavos. */
const moneyText = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, { error: "Expected a non-negative 2-decimal amount" })
  .transform((v) => decimalToCentavos(v));

const count = z.number().int().nonnegative();

const groupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  gross: moneyText,
  commission: moneyText,
  transactions: count,
  quantity: count,
});

/**
 * Validates the JSON returned by public.sales_report() before it is trusted.
 * Database output is still external input at this boundary.
 */
export const salesAggregatesSchema = z
  .object({
    totals: z.object({ gross: moneyText, commission: moneyText, transactions: count, quantity: count }),
    daily: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        gross: moneyText,
        commission: moneyText,
        transactions: count,
      }),
    ),
    byBarber: z.array(groupSchema),
    byService: z.array(groupSchema),
  })
  .transform(
    (r): RawSalesAggregates => ({
      totals: {
        grossCentavos: r.totals.gross,
        commissionCentavos: r.totals.commission,
        transactions: r.totals.transactions,
        quantity: r.totals.quantity,
      },
      daily: r.daily.map((d) => ({
        date: d.date,
        grossCentavos: d.gross,
        commissionCentavos: d.commission,
        transactions: d.transactions,
      })),
      byBarber: r.byBarber.map((g) => ({
        id: g.id,
        name: g.name,
        grossCentavos: g.gross,
        commissionCentavos: g.commission,
        transactions: g.transactions,
        quantity: g.quantity,
      })),
      byService: r.byService.map((g) => ({
        id: g.id,
        name: g.name,
        grossCentavos: g.gross,
        commissionCentavos: g.commission,
        transactions: g.transactions,
        quantity: g.quantity,
      })),
    }),
  );
