/**
 * Exact money and rate handling.
 *
 * - Money is an integer number of centavos (1 peso = 100 centavos).
 * - Commission rates are integer basis points (1 bp = 0.01%; 10000 bp = 100%),
 *   matching the database's numeric(5,4) precision exactly.
 *
 * Floating-point values never act as a source of truth. Decimal strings are
 * parsed textually, and the database boundary uses decimal strings both ways.
 */

export type Centavos = number;
export type BasisPoints = number;

export const BASIS_POINTS_PER_UNIT = 10_000;
/** Upper bound for a single service price: PHP 100,000.00. */
export const MAX_PRICE_CENTAVOS = 10_000_000;

function assertSafeNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`);
  }
}

/**
 * Parse a peso amount typed by a user ("250", "250.5", "1,250.00") into
 * centavos. Returns null when the text is not a valid amount with at most
 * two decimal places.
 */
export function parsePesosToCentavos(input: string): Centavos | null {
  const text = input.trim().replace(/,/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

/**
 * Parse a commission percentage ("40", "12.5", "33.33") into basis points.
 * Returns null unless it is 0-100 with at most two decimal places.
 */
export function parsePercentToBasisPoints(input: string): BasisPoints | null {
  const text = input.trim().replace(/%$/, "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= BASIS_POINTS_PER_UNIT ? bp : null;
}

/**
 * Convert a numeric(…,2) value read from the database (PostgREST returns
 * JSON numbers such as 250 or 199.99) into centavos. Uses the shortest decimal
 * representation, which round-trips exactly for values within safe range.
 */
export function decimalToCentavos(value: number | string): Centavos {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Not a non-negative 2-decimal amount: ${text}`);
  const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  assertSafeNonNegativeInteger(result, "amount");
  return result;
}

/** Convert a numeric(5,4) rate read from the database (e.g. 0.4) into basis points. */
export function decimalToBasisPoints(value: number | string): BasisPoints {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^(0|1)(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) throw new RangeError(`Not a 0-1 rate with up to 4 decimals: ${text}`);
  const result = Number(match[1]) * BASIS_POINTS_PER_UNIT + Number((match[2] ?? "").padEnd(4, "0"));
  if (result > BASIS_POINTS_PER_UNIT) throw new RangeError(`Rate above 1: ${text}`);
  return result;
}

/** Exact decimal string for the database, e.g. 50050 -> "500.50". */
export function centavosToDecimalString(centavos: Centavos): string {
  assertSafeNonNegativeInteger(centavos, "centavos");
  const whole = Math.floor(centavos / 100);
  const cents = centavos % 100;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

/** Exact decimal string for numeric(5,4), e.g. 4000 -> "0.4000". */
export function basisPointsToDecimalString(bp: BasisPoints): string {
  assertSafeNonNegativeInteger(bp, "basis points");
  if (bp > BASIS_POINTS_PER_UNIT) throw new RangeError(`Rate above 100%: ${bp}`);
  const whole = Math.floor(bp / BASIS_POINTS_PER_UNIT);
  const fraction = bp % BASIS_POINTS_PER_UNIT;
  return `${whole}.${String(fraction).padStart(4, "0")}`;
}

/**
 * Divide a non-negative integer and round half up (away from zero), matching
 * PostgreSQL's round(numeric) for non-negative values.
 */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeNonNegativeInteger(numerator, "numerator");
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive integer, got ${denominator}`);
  }
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display only, e.g. 125050 -> "₱1,250.50". */
export function formatPeso(centavos: Centavos): string {
  assertSafeNonNegativeInteger(centavos, "centavos");
  // Format the whole pesos, then append exact centavos, so no float rounding is involved.
  const whole = pesoFormatter.format(Math.floor(centavos / 100)).replace(/\.00$/, "");
  return `${whole}.${String(centavos % 100).padStart(2, "0")}`;
}

const compactFormatter = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });

/** Axis ticks only, e.g. 0 -> "₱0", 150_000 -> "₱1.5K", 120_000_000 -> "₱1.2M". */
export function formatPesoCompact(centavos: Centavos): string {
  return `₱${compactFormatter.format(Math.round(centavos / 100))}`;
}

/** Display only, e.g. 4000 -> "40%", 1250 -> "12.5%". */
export function formatPercent(bp: BasisPoints): string {
  assertSafeNonNegativeInteger(bp, "basis points");
  const whole = Math.floor(bp / 100);
  const fraction = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

/** A share of a whole, always one decimal so columns align, e.g. 3369 -> "33.7%", 970 -> "9.7%". */
export function formatShare(bp: BasisPoints): string {
  assertSafeNonNegativeInteger(bp, "basis points");
  const tenths = divideRoundHalfUp(bp, 10); // tenths of a percent
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

/** Editable form value for a rate, e.g. 4000 -> "40", 1250 -> "12.5". */
export function basisPointsToPercentInput(bp: BasisPoints): string {
  return formatPercent(bp).replace(/%$/, "");
}

/** Editable form value for a price, e.g. 25000 -> "250.00". */
export function centavosToPesoInput(centavos: Centavos): string {
  return centavosToDecimalString(centavos);
}
