import { addDays, rangeLengthDays } from "./dates";
import { divideRoundHalfUp, type Centavos } from "./money";

/** Aggregates as computed by the database (exact sums, converted to centavos). */
export interface RawDailyAggregate {
  date: string; // Asia/Manila calendar date, YYYY-MM-DD
  grossCentavos: Centavos;
  commissionCentavos: Centavos;
  transactions: number;
}

export interface RawGroupAggregate {
  id: string;
  name: string;
  grossCentavos: Centavos;
  commissionCentavos: Centavos;
  transactions: number;
  quantity: number;
}

export interface RawSalesAggregates {
  totals: { grossCentavos: Centavos; commissionCentavos: Centavos; transactions: number; quantity: number };
  daily: RawDailyAggregate[];
  byBarber: RawGroupAggregate[];
  byService: RawGroupAggregate[];
}

export interface MetricsTotals {
  grossCentavos: Centavos;
  transactionCount: number;
  commissionCentavos: Centavos;
  /** gross / transactions, rounded half up to the centavo; 0 when there are no sales. */
  averageTransactionCentavos: Centavos;
  servicesPerformed: number;
}

export interface DailyPoint {
  date: string;
  grossCentavos: Centavos;
  commissionCentavos: Centavos;
  transactionCount: number;
}

export interface BreakdownRow {
  /** null for the folded "Other" row. */
  id: string | null;
  name: string;
  grossCentavos: Centavos;
  commissionCentavos: Centavos;
  transactionCount: number;
  quantity: number;
  /** Share of gross sales in basis points (10000 = 100%). */
  shareBp: number;
}

export interface SalesReport {
  range: { from: string; to: string; days: number; timeZone: "Asia/Manila" };
  isEmpty: boolean;
  totals: MetricsTotals;
  daily: DailyPoint[];
  byBarber: BreakdownRow[];
  byService: BreakdownRow[];
}

/** Breakdown charts show at most this many named rows; the rest fold into "Other". */
export const MAX_BREAKDOWN_ROWS = 8;

export function averageCentavos(grossCentavos: Centavos, count: number): Centavos {
  return count > 0 ? divideRoundHalfUp(grossCentavos, count) : 0;
}

function shareBp(part: Centavos, whole: Centavos): number {
  return whole > 0 ? divideRoundHalfUp(part * 10_000, whole) : 0;
}

function buildBreakdown(groups: readonly RawGroupAggregate[], totalGross: Centavos, otherLabel: string): BreakdownRow[] {
  const sorted = [...groups].sort((a, b) => b.grossCentavos - a.grossCentavos || a.name.localeCompare(b.name));
  const toRow = (g: RawGroupAggregate): BreakdownRow => ({
    id: g.id,
    name: g.name,
    grossCentavos: g.grossCentavos,
    commissionCentavos: g.commissionCentavos,
    transactionCount: g.transactions,
    quantity: g.quantity,
    shareBp: shareBp(g.grossCentavos, totalGross),
  });
  if (sorted.length <= MAX_BREAKDOWN_ROWS) return sorted.map(toRow);

  const head = sorted.slice(0, MAX_BREAKDOWN_ROWS - 1).map(toRow);
  const rest = sorted.slice(MAX_BREAKDOWN_ROWS - 1);
  const other = rest.reduce(
    (acc, g) => ({
      grossCentavos: acc.grossCentavos + g.grossCentavos,
      commissionCentavos: acc.commissionCentavos + g.commissionCentavos,
      transactionCount: acc.transactionCount + g.transactions,
      quantity: acc.quantity + g.quantity,
    }),
    { grossCentavos: 0, commissionCentavos: 0, transactionCount: 0, quantity: 0 },
  );
  return [
    ...head,
    { id: null, name: `${otherLabel} (${rest.length})`, ...other, shareBp: shareBp(other.grossCentavos, totalGross) },
  ];
}

/**
 * Turn database aggregates into the dashboard report. Pure and deterministic:
 * every day in [from, to] appears (zero-filled), totals come straight from
 * the database sums, and the average is computed in integer centavos.
 */
export function buildSalesReport(raw: RawSalesAggregates, from: string, to: string): SalesReport {
  const days = rangeLengthDays(from, to);
  const byDate = new Map(raw.daily.map((d) => [d.date, d]));

  const daily: DailyPoint[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const d = byDate.get(date);
    return {
      date,
      grossCentavos: d?.grossCentavos ?? 0,
      commissionCentavos: d?.commissionCentavos ?? 0,
      transactionCount: d?.transactions ?? 0,
    };
  });

  const { grossCentavos, commissionCentavos, transactions, quantity } = raw.totals;

  return {
    range: { from, to, days, timeZone: "Asia/Manila" },
    isEmpty: transactions === 0,
    totals: {
      grossCentavos,
      transactionCount: transactions,
      commissionCentavos,
      averageTransactionCentavos: averageCentavos(grossCentavos, transactions),
      servicesPerformed: quantity,
    },
    daily,
    byBarber: buildBreakdown(raw.byBarber, grossCentavos, "Other barbers"),
    byService: buildBreakdown(raw.byService, grossCentavos, "Other services"),
  };
}

export const EMPTY_AGGREGATES: RawSalesAggregates = {
  totals: { grossCentavos: 0, commissionCentavos: 0, transactions: 0, quantity: 0 },
  daily: [],
  byBarber: [],
  byService: [],
};
