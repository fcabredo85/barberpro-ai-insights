import {
  BASIS_POINTS_PER_UNIT,
  divideRoundHalfUp,
  type BasisPoints,
  type Centavos,
} from "./money";

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;

export const PAYMENT_METHODS = ["cash", "gcash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
};

export interface SaleCalculationInput {
  unitPriceCentavos: Centavos;
  quantity: number;
  commissionRateBp: BasisPoints;
}

export interface SaleTotals {
  unitPriceCentavos: Centavos;
  quantity: number;
  commissionRateBp: BasisPoints;
  grossCentavos: Centavos;
  commissionCentavos: Centavos;
}

/**
 * Deterministic sale arithmetic:
 *   gross      = unit_price x quantity              (exact)
 *   commission = gross x rate, rounded half up to the centavo
 * Mirrors the database CHECK constraints on public.sales.
 */
export function calculateSale({ unitPriceCentavos, quantity, commissionRateBp }: SaleCalculationInput): SaleTotals {
  if (!Number.isSafeInteger(unitPriceCentavos) || unitPriceCentavos <= 0) {
    throw new RangeError("unit price must be a positive whole number of centavos");
  }
  if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
    throw new RangeError(`quantity must be an integer from ${MIN_QUANTITY} to ${MAX_QUANTITY}`);
  }
  if (!Number.isInteger(commissionRateBp) || commissionRateBp < 0 || commissionRateBp > BASIS_POINTS_PER_UNIT) {
    throw new RangeError("commission rate must be 0 to 10000 basis points");
  }

  const grossCentavos = unitPriceCentavos * quantity;
  const commissionCentavos = divideRoundHalfUp(grossCentavos * commissionRateBp, BASIS_POINTS_PER_UNIT);

  return { unitPriceCentavos, quantity, commissionRateBp, grossCentavos, commissionCentavos };
}
