import "server-only";

import {
  basisPointsToDecimalString,
  centavosToDecimalString,
  decimalToBasisPoints,
  decimalToCentavos,
  type BasisPoints,
  type Centavos,
} from "@/lib/business/money";
import type { DbClient } from "@/lib/db/types";

export interface Barber {
  id: string;
  name: string;
  commissionRateBp: BasisPoints;
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  priceCentavos: Centavos;
  /** Appointment length: 30, 45 or 60 minutes. */
  durationMinutes: number;
  active: boolean;
}

export type CatalogWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid" | "forbidden" | "error" };

/**
 * Exact decimal value for a numeric column. PostgREST types numeric as a JSON
 * number; converting from an exact decimal string is lossless for these
 * magnitudes (far below 15 significant digits), and JSON re-serializes it as
 * the same decimal text.
 */
const dbAmount = (centavos: Centavos) => Number(centavosToDecimalString(centavos));
const dbRate = (bp: BasisPoints) => Number(basisPointsToDecimalString(bp));

function writeFailure(error: { code?: string }): CatalogWriteResult {
  if (error.code === "23514" || error.code === "22P02") return { ok: false, reason: "invalid" };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  return { ok: false, reason: "error" };
}

// ---------------------------------------------------------------------------
// Barbers
// ---------------------------------------------------------------------------

export async function listBarbers(
  db: DbClient,
  barbershopId: string,
  options: { activeOnly?: boolean } = {},
): Promise<Barber[]> {
  let query = db
    .from("barbers")
    .select("id, name, commission_rate, active")
    .eq("barbershop_id", barbershopId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  if (options.activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw new Error("Failed to load barbers", { cause: error.code });
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    commissionRateBp: decimalToBasisPoints(row.commission_rate),
    active: row.active,
  }));
}

export async function createBarber(
  db: DbClient,
  barbershopId: string,
  input: { name: string; commissionRateBp: BasisPoints },
): Promise<CatalogWriteResult> {
  const { data, error } = await db
    .from("barbers")
    .insert({ barbershop_id: barbershopId, name: input.name, commission_rate: dbRate(input.commissionRateBp) })
    .select("id")
    .single();
  return error ? writeFailure(error) : { ok: true, id: data.id };
}

export async function updateBarber(
  db: DbClient,
  barbershopId: string,
  id: string,
  changes: { name?: string; commissionRateBp?: BasisPoints; active?: boolean },
): Promise<CatalogWriteResult> {
  const { data, error } = await db
    .from("barbers")
    .update({
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.commissionRateBp !== undefined && { commission_rate: dbRate(changes.commissionRateBp) }),
      ...(changes.active !== undefined && { active: changes.active }),
    })
    .eq("id", id)
    .eq("barbershop_id", barbershopId)
    .select("id");
  if (error) return writeFailure(error);
  // RLS hides other tenants' rows, so "no row updated" means not found here.
  return data.length === 1 ? { ok: true, id } : { ok: false, reason: "not_found" };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function listServices(
  db: DbClient,
  barbershopId: string,
  options: { activeOnly?: boolean } = {},
): Promise<Service[]> {
  let query = db
    .from("services")
    .select("id, name, price, duration_minutes, active")
    .eq("barbershop_id", barbershopId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });
  if (options.activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw new Error("Failed to load services", { cause: error.code });
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    priceCentavos: decimalToCentavos(row.price),
    durationMinutes: row.duration_minutes,
    active: row.active,
  }));
}

export async function createService(
  db: DbClient,
  barbershopId: string,
  input: { name: string; priceCentavos: Centavos; durationMinutes?: number },
): Promise<CatalogWriteResult> {
  const { data, error } = await db
    .from("services")
    .insert({
      barbershop_id: barbershopId,
      name: input.name,
      price: dbAmount(input.priceCentavos),
      ...(input.durationMinutes !== undefined && { duration_minutes: input.durationMinutes }),
    })
    .select("id")
    .single();
  return error ? writeFailure(error) : { ok: true, id: data.id };
}

export async function updateService(
  db: DbClient,
  barbershopId: string,
  id: string,
  changes: { name?: string; priceCentavos?: Centavos; durationMinutes?: number; active?: boolean },
): Promise<CatalogWriteResult> {
  const { data, error } = await db
    .from("services")
    .update({
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.priceCentavos !== undefined && { price: dbAmount(changes.priceCentavos) }),
      ...(changes.durationMinutes !== undefined && { duration_minutes: changes.durationMinutes }),
      ...(changes.active !== undefined && { active: changes.active }),
    })
    .eq("id", id)
    .eq("barbershop_id", barbershopId)
    .select("id");
  if (error) return writeFailure(error);
  return data.length === 1 ? { ok: true, id } : { ok: false, reason: "not_found" };
}

export { dbAmount, dbRate };
