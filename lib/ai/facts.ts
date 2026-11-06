import { formatCalendarDateLong } from "@/lib/business/dates";
import type { BreakdownRow, SalesReport } from "@/lib/business/metrics";
import { divideRoundHalfUp, formatPeso, formatShare, type Centavos } from "@/lib/business/money";

/**
 * The ONLY data the model may cite. Every number in an insight must come from
 * here: the model references facts by id, and the server renders their values.
 */
export interface Fact {
  id: string;
  /** Label as shown to the model (barbers pseudonymized, e.g. "Barber 1"). */
  modelLabel: string;
  /** Label as shown to the owner (real names restored). */
  displayLabel: string;
  /** Exact display value, e.g. "₱1,549.96", "4", "38.8%". */
  value: string;
  /** Numeric forms a claim may use for this fact (e.g. 1549.96 and 1550). */
  numbers: number[];
}

export interface InsightContext {
  facts: Fact[];
  factsById: Map<string, Fact>;
  /** Alias -> real name, e.g. "Barber 1" -> "Paolo". */
  aliases: Map<string, string>;
  /** Exactly what is sent to the model: aggregates only. */
  modelPayload: {
    period: { from: string; to: string; days: number; timeZone: "Asia/Manila" };
    facts: Array<{ id: string; label: string; value: string }>;
  };
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function moneyNumbers(c: Centavos): number[] {
  const pesos = c / 100;
  return [...new Set([pesos, Math.round(pesos)])];
}

function shareNumbers(bp: number): number[] {
  const oneDecimal = divideRoundHalfUp(bp, 10) / 10;
  return [...new Set([oneDecimal, Math.round(bp / 100), bp / 100])];
}

class FactBuilder {
  readonly facts: Fact[] = [];

  money(id: string, modelLabel: string, displayLabel: string, c: Centavos) {
    this.facts.push({ id, modelLabel, displayLabel, value: formatPeso(c), numbers: moneyNumbers(c) });
  }
  count(id: string, modelLabel: string, displayLabel: string, n: number) {
    this.facts.push({ id, modelLabel, displayLabel, value: n.toLocaleString("en-PH"), numbers: [n] });
  }
  share(id: string, modelLabel: string, displayLabel: string, bp: number) {
    this.facts.push({ id, modelLabel, displayLabel, value: formatShare(bp), numbers: shareNumbers(bp) });
  }
}

function addGroupFacts(
  b: FactBuilder,
  rows: readonly BreakdownRow[],
  kind: "barber" | "service",
  aliasFor: (row: BreakdownRow, index: number) => { model: string; display: string },
) {
  rows.forEach((row, i) => {
    const { model, display } = aliasFor(row, i);
    const key = `${kind}_${i + 1}`;
    b.money(`${key}_gross`, `${model}: gross sales`, `${display}: gross sales`, row.grossCentavos);
    b.share(`${key}_share`, `${model}: share of gross sales`, `${display}: share of gross sales`, row.shareBp);
    b.count(`${key}_transactions`, `${model}: transactions`, `${display}: transactions`, row.transactionCount);
    if (kind === "barber") {
      b.money(`${key}_commission`, `${model}: commission earned`, `${display}: commission earned`, row.commissionCentavos);
      if (row.transactionCount > 0) {
        b.money(
          `${key}_avg`,
          `${model}: average sale`,
          `${display}: average sale`,
          divideRoundHalfUp(row.grossCentavos, row.transactionCount),
        );
      }
    } else {
      b.count(`${key}_quantity`, `${model}: services performed`, `${display}: services performed`, row.quantity);
    }
  });
}

/**
 * Build the permitted fact sheet from a server-computed report. Nothing else
 * (no customer data, emails, ids, raw rows or other tenants' data) is included.
 */
export function buildInsightContext(report: SalesReport): InsightContext {
  const b = new FactBuilder();
  const t = report.totals;
  const aliases = new Map<string, string>();

  b.money("total_gross", "Total gross sales", "Total gross sales", t.grossCentavos);
  b.count("total_transactions", "Number of transactions", "Number of transactions", t.transactionCount);
  b.money("total_commission", "Total barber commissions", "Total barber commissions", t.commissionCentavos);
  b.money("avg_transaction", "Average transaction value", "Average transaction value", t.averageTransactionCentavos);
  b.count("services_performed", "Services performed", "Services performed", t.servicesPerformed);
  if (t.grossCentavos > 0) {
    b.share(
      "commission_share",
      "Commissions as a share of gross sales",
      "Commissions as a share of gross sales",
      divideRoundHalfUp(t.commissionCentavos * 10_000, t.grossCentavos),
    );
  }
  b.count("days_in_range", "Days in the period", "Days in the period", report.range.days);

  const salesDays = report.daily.filter((d) => d.transactionCount > 0);
  b.count("days_with_sales", "Days with at least one sale", "Days with at least one sale", salesDays.length);

  if (salesDays.length > 0) {
    const best = salesDays.reduce((a, d) => (d.grossCentavos > a.grossCentavos ? d : a));
    const label = `Best day (${formatCalendarDateLong(best.date)}): gross sales`;
    b.money("best_day_gross", label, label, best.grossCentavos);
  }
  if (salesDays.length > 1) {
    const low = salesDays.reduce((a, d) => (d.grossCentavos < a.grossCentavos ? d : a));
    const label = `Lowest day with sales (${formatCalendarDateLong(low.date)}): gross sales`;
    b.money("lowest_day_gross", label, label, low.grossCentavos);
  }

  // Weekday pattern, only when every weekday occurs in the range.
  if (report.range.days >= 7) {
    const byWeekday = new Map<number, { gross: number; days: number }>();
    for (const d of report.daily) {
      const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const cur = byWeekday.get(wd) ?? { gross: 0, days: 0 };
      byWeekday.set(wd, { gross: cur.gross + d.grossCentavos, days: cur.days + 1 });
    }
    for (const [wd, agg] of [...byWeekday.entries()].sort((x, y) => x[0] - y[0])) {
      const label = `${WEEKDAY_NAMES[wd]}s: average gross sales per day`;
      b.money(`weekday_${WEEKDAYS[wd]}_avg_gross`, label, label, divideRoundHalfUp(agg.gross, agg.days));
    }
  }

  // Per-day facts for days with sales (bounded by the 366-day range limit).
  for (const d of salesDays) {
    const id = `day_${d.date.replaceAll("-", "")}`;
    const label = `${formatCalendarDateLong(d.date)}`;
    b.money(`${id}_gross`, `${label}: gross sales`, `${label}: gross sales`, d.grossCentavos);
    b.count(`${id}_transactions`, `${label}: transactions`, `${label}: transactions`, d.transactionCount);
  }

  // Barbers are staff: pseudonymize before anything leaves the server.
  addGroupFacts(b, report.byBarber, "barber", (row, i) => {
    if (row.id === null) return { model: "Other barbers", display: row.name };
    const alias = `Barber ${i + 1}`;
    aliases.set(alias, row.name);
    return { model: alias, display: row.name };
  });
  // Services are business catalog items, not personal data.
  addGroupFacts(b, report.byService, "service", (row) => ({ model: row.name, display: row.name }));

  const facts = b.facts;
  return {
    facts,
    factsById: new Map(facts.map((f) => [f.id, f])),
    aliases,
    modelPayload: {
      period: { from: report.range.from, to: report.range.to, days: report.range.days, timeZone: "Asia/Manila" },
      facts: facts.map((f) => ({ id: f.id, label: f.modelLabel, value: f.value })),
    },
  };
}

/** Minimum recorded sales before insights are attempted. */
export const MIN_TRANSACTIONS_FOR_INSIGHTS = 5;

export function hasEnoughDataForInsights(report: SalesReport): boolean {
  return report.totals.transactionCount >= MIN_TRANSACTIONS_FOR_INSIGHTS;
}

