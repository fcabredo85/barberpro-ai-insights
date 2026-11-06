import type { SaleRecord } from "@/lib/db/sales";

/** Public receipt shape returned by POST /api/sales (money as integer centavos). */
export interface SaleReceipt {
  id: string;
  occurredAt: string;
  barber: { id: string; name: string };
  service: { id: string; name: string };
  quantity: number;
  unitPriceCentavos: number;
  grossCentavos: number;
  commissionRateBp: number;
  commissionCentavos: number;
  paymentMethod: "cash" | "gcash";
  requestKey: string;
}

export function toReceipt(sale: SaleRecord): SaleReceipt {
  return {
    id: sale.id,
    occurredAt: sale.occurredAt,
    barber: { id: sale.barberId, name: sale.barberName },
    service: { id: sale.serviceId, name: sale.serviceName },
    quantity: sale.quantity,
    unitPriceCentavos: sale.unitPriceCentavos,
    grossCentavos: sale.grossCentavos,
    commissionRateBp: sale.commissionRateBp,
    commissionCentavos: sale.commissionCentavos,
    paymentMethod: sale.paymentMethod,
    requestKey: sale.requestKey,
  };
}
