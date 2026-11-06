import "server-only";

import { decimalToBasisPoints, decimalToCentavos } from "@/lib/business/money";
import { calculateSale } from "@/lib/business/sale";
import { dbAmount, dbRate } from "@/lib/db/catalog";
import { SALE_COLUMNS, findSaleByRequestKey, toSaleRecord, type SaleRecord } from "@/lib/db/sales";
import type { DbClient } from "@/lib/db/types";
import type { CreateSaleInput } from "@/lib/validation/sales";

export type CreateSaleResult =
  | { kind: "created"; sale: SaleRecord }
  | { kind: "replayed"; sale: SaleRecord }
  | { kind: "conflict" }
  | { kind: "invalid_selection"; field: "barberId" | "serviceId" }
  | { kind: "error" };

/** Does a stored sale correspond to this exact request? */
function samePayload(sale: SaleRecord, input: CreateSaleInput): boolean {
  return (
    sale.barberId === input.barberId &&
    sale.serviceId === input.serviceId &&
    sale.quantity === input.quantity &&
    sale.paymentMethod === input.paymentMethod
  );
}

function replayOrConflict(sale: SaleRecord, input: CreateSaleInput): CreateSaleResult {
  return samePayload(sale, input) ? { kind: "replayed", sale } : { kind: "conflict" };
}

/**
 * Record a sale for an already-authorized barbershop.
 *
 * - Price and commission rate are read from the shop's ACTIVE catalog rows
 *   (under RLS) and snapshotted; the client never supplies them.
 * - Totals are computed in integer centavos (see lib/business/sale.ts).
 * - The insert is a single atomic statement; the unique (barbershop_id,
 *   request_key) constraint makes it idempotent, including under concurrency.
 *
 * @param barbershopId Derived server-side from the caller's membership.
 */
export async function createSale(
  db: DbClient,
  barbershopId: string,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  const existing = await findSaleByRequestKey(db, barbershopId, input.requestKey);
  if (existing) return replayOrConflict(existing, input);

  // Two attempts: if the catalog changes between our read and the insert, the
  // RLS snapshot policy rejects the insert (42501) and we re-read once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [barberResult, serviceResult] = await Promise.all([
      db
        .from("barbers")
        .select("id, commission_rate")
        .eq("id", input.barberId)
        .eq("barbershop_id", barbershopId)
        .eq("active", true)
        .maybeSingle(),
      db
        .from("services")
        .select("id, price")
        .eq("id", input.serviceId)
        .eq("barbershop_id", barbershopId)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (barberResult.error || serviceResult.error) return { kind: "error" };
    if (!barberResult.data) return { kind: "invalid_selection", field: "barberId" };
    if (!serviceResult.data) return { kind: "invalid_selection", field: "serviceId" };

    const totals = calculateSale({
      unitPriceCentavos: decimalToCentavos(serviceResult.data.price),
      quantity: input.quantity,
      commissionRateBp: decimalToBasisPoints(barberResult.data.commission_rate),
    });

    const { data, error } = await db
      .from("sales")
      .insert({
        barbershop_id: barbershopId,
        barber_id: input.barberId,
        service_id: input.serviceId,
        quantity: totals.quantity,
        unit_price: dbAmount(totals.unitPriceCentavos),
        gross_total: dbAmount(totals.grossCentavos),
        commission_rate: dbRate(totals.commissionRateBp),
        commission_amount: dbAmount(totals.commissionCentavos),
        payment_method: input.paymentMethod,
        request_key: input.requestKey,
      })
      .select(SALE_COLUMNS)
      .single();

    if (!error) return { kind: "created", sale: toSaleRecord(data) };

    if (error.code === "23505") {
      // A concurrent request with the same key won the race.
      const winner = await findSaleByRequestKey(db, barbershopId, input.requestKey);
      return winner ? replayOrConflict(winner, input) : { kind: "error" };
    }
    if (error.code === "42501" && attempt === 0) continue;
    return { kind: "error" };
  }
  return { kind: "error" };
}
