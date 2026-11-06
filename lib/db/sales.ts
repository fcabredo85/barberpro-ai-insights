import "server-only";

import { decimalToBasisPoints, decimalToCentavos, type BasisPoints, type Centavos } from "@/lib/business/money";
import type { UtcRange } from "@/lib/business/dates";
import type { DbClient, DbPaymentMethod } from "@/lib/db/types";

export interface SaleRecord {
  id: string;
  occurredAt: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPriceCentavos: Centavos;
  grossCentavos: Centavos;
  commissionRateBp: BasisPoints;
  commissionCentavos: Centavos;
  paymentMethod: DbPaymentMethod;
  requestKey: string;
}

/** Columns for a full sale record, including barber/service names via the same-shop FKs. */
export const SALE_COLUMNS =
  "id, occurred_at, barber_id, service_id, quantity, unit_price, gross_total, commission_rate, commission_amount, payment_method, request_key, barbers ( name ), services ( name )" as const;

interface SaleRow {
  id: string;
  occurred_at: string;
  barber_id: string;
  service_id: string;
  quantity: number;
  unit_price: number;
  gross_total: number;
  commission_rate: number;
  commission_amount: number;
  payment_method: DbPaymentMethod;
  request_key: string;
  barbers: { name: string } | null;
  services: { name: string } | null;
}

export function toSaleRecord(row: SaleRow): SaleRecord {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    barberId: row.barber_id,
    barberName: row.barbers?.name ?? "Unknown barber",
    serviceId: row.service_id,
    serviceName: row.services?.name ?? "Unknown service",
    quantity: row.quantity,
    unitPriceCentavos: decimalToCentavos(row.unit_price),
    grossCentavos: decimalToCentavos(row.gross_total),
    commissionRateBp: decimalToBasisPoints(row.commission_rate),
    commissionCentavos: decimalToCentavos(row.commission_amount),
    paymentMethod: row.payment_method,
    requestKey: row.request_key,
  };
}

export async function findSaleByRequestKey(
  db: DbClient,
  barbershopId: string,
  requestKey: string,
): Promise<SaleRecord | null> {
  const { data, error } = await db
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("barbershop_id", barbershopId)
    .eq("request_key", requestKey)
    .maybeSingle();
  if (error) throw new Error("Failed to look up sale by request key", { cause: error.code });
  return data ? toSaleRecord(data) : null;
}

export async function getSale(db: DbClient, barbershopId: string, id: string): Promise<SaleRecord | null> {
  const { data, error } = await db
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("barbershop_id", barbershopId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // malformed uuid
    throw new Error("Failed to load sale", { cause: error.code });
  }
  return data ? toSaleRecord(data) : null;
}

export const SALES_PAGE_LIMIT = 200;

export async function listSales(
  db: DbClient,
  barbershopId: string,
  range: UtcRange,
  limit: number = SALES_PAGE_LIMIT,
): Promise<{ sales: SaleRecord[]; truncated: boolean }> {
  const { data, error } = await db
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("barbershop_id", barbershopId)
    .gte("occurred_at", range.startUtc)
    .lt("occurred_at", range.endUtc)
    .order("occurred_at", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error("Failed to load sales", { cause: error.code });
  return { sales: data.slice(0, limit).map(toSaleRecord), truncated: data.length > limit };
}
