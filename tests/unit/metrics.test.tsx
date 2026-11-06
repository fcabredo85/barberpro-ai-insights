import { randomUUID } from "node:crypto";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import {
  EMPTY_AGGREGATES,
  MAX_BREAKDOWN_ROWS,
  buildSalesReport,
  type RawGroupAggregate,
  type RawSalesAggregates,
} from "@/lib/business/metrics";
import { niceTicks } from "@/lib/business/axis";
import { formatShare } from "@/lib/business/money";
import { matchPreset, presetRange } from "@/lib/business/report-range";
import { salesAggregatesSchema } from "@/lib/validation/metrics";
import { parseReportRange } from "@/lib/validation/report-range";

const NOW = new Date("2026-11-06T04:00:00Z"); // 12:00 noon in Manila

function group(name: string, gross: number, commission: number, transactions: number, quantity = transactions): RawGroupAggregate {
  return { id: randomUUID(), name, grossCentavos: gross, commissionCentavos: commission, transactions, quantity };
}

describe("buildSalesReport: empty report", () => {
  const report = buildSalesReport(EMPTY_AGGREGATES, "2026-11-01", "2026-11-07");

  it("returns zero totals and no invented sales", () => {
    expect(report.isEmpty).toBe(true);
    expect(report.totals).toEqual({
      grossCentavos: 0,
      transactionCount: 0,
      commissionCentavos: 0,
      averageTransactionCentavos: 0,
      servicesPerformed: 0,
    });
    expect(report.byBarber).toEqual([]);
    expect(report.byService).toEqual([]);
  });

  it("still lists every day in the range with zeros", () => {
    expect(report.daily.map((d) => d.date)).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
    expect(report.daily.every((d) => d.grossCentavos === 0 && d.transactionCount === 0)).toBe(true);
    expect(report.range).toEqual({ from: "2026-11-01", to: "2026-11-07", days: 7, timeZone: "Asia/Manila" });
  });
});

describe("buildSalesReport: populated report", () => {
  const raw: RawSalesAggregates = {
    totals: { grossCentavos: 100_001, commissionCentavos: 40_000, transactions: 3, quantity: 4 },
    daily: [
      { date: "2026-11-02", grossCentavos: 75_001, commissionCentavos: 30_000, transactions: 2 },
      { date: "2026-11-05", grossCentavos: 25_000, commissionCentavos: 10_000, transactions: 1 },
    ],
    byBarber: [group("Migs", 25_000, 10_000, 1), group("Paolo", 75_001, 30_000, 2, 3)],
    byService: [group("Haircut", 100_001, 40_000, 3, 4)],
  };
  const report = buildSalesReport(raw, "2026-11-01", "2026-11-05");

  it("uses the database totals and computes the average in centavos (half up)", () => {
    expect(report.isEmpty).toBe(false);
    expect(report.totals).toMatchObject({ grossCentavos: 100_001, transactionCount: 3, commissionCentavos: 40_000 });
    // 100,001 / 3 = 33,333.67 centavos -> 33,334
    expect(report.totals.averageTransactionCentavos).toBe(33_334);
    expect(report.totals.servicesPerformed).toBe(4);
  });

  it("zero-fills missing days and keeps days that have sales", () => {
    expect(report.daily.map((d) => [d.date, d.grossCentavos])).toEqual([
      ["2026-11-01", 0],
      ["2026-11-02", 75_001],
      ["2026-11-03", 0],
      ["2026-11-04", 0],
      ["2026-11-05", 25_000],
    ]);
  });

  it("daily and breakdown figures add up to the totals", () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(report.daily.map((d) => d.grossCentavos))).toBe(report.totals.grossCentavos);
    expect(sum(report.daily.map((d) => d.transactionCount))).toBe(report.totals.transactionCount);
    expect(sum(report.byBarber.map((b) => b.grossCentavos))).toBe(report.totals.grossCentavos);
    expect(sum(report.byBarber.map((b) => b.commissionCentavos))).toBe(report.totals.commissionCentavos);
  });

  it("sorts breakdowns by gross, highest first, with shares", () => {
    expect(report.byBarber.map((b) => b.name)).toEqual(["Paolo", "Migs"]);
    expect(report.byBarber.map((b) => b.shareBp)).toEqual([7_500, 2_500]);
    expect(report.byService[0]).toMatchObject({ name: "Haircut", shareBp: 10_000, quantity: 4 });
  });

  it("folds categories beyond the cap into one 'Other' row without losing totals", () => {
    const many = Array.from({ length: 11 }, (_, i) => group(`Barber ${i + 1}`, (11 - i) * 1_000, (11 - i) * 400, 1));
    const total = many.reduce((a, g) => a + g.grossCentavos, 0);
    const r = buildSalesReport(
      { totals: { grossCentavos: total, commissionCentavos: total * 0.4, transactions: 11, quantity: 11 }, daily: [], byBarber: many, byService: [] },
      "2026-11-06",
      "2026-11-06",
    );
    expect(r.byBarber).toHaveLength(MAX_BREAKDOWN_ROWS);
    const other = r.byBarber.at(-1)!;
    expect(other).toMatchObject({ id: null, name: "Other barbers (4)", transactionCount: 4 });
    expect(r.byBarber.reduce((a, b) => a + b.grossCentavos, 0)).toBe(total);
  });
});

describe("salesAggregatesSchema (validating database output)", () => {
  const dbJson = {
    totals: { gross: "500.00", commission: "200.00", transactions: 1, quantity: 2 },
    daily: [{ date: "2026-11-06", gross: "500.00", commission: "200.00", transactions: 1 }],
    byBarber: [{ id: randomUUID(), name: "Paolo", gross: "500.00", commission: "200.00", transactions: 1, quantity: 2 }],
    byService: [],
  };

  it("converts exact decimal text to centavos", () => {
    const parsed = salesAggregatesSchema.parse(dbJson);
    expect(parsed.totals).toEqual({ grossCentavos: 50_000, commissionCentavos: 20_000, transactions: 1, quantity: 2 });
    expect(parsed.byBarber[0]?.grossCentavos).toBe(50_000);
  });

  it("accepts the empty-report shape", () => {
    const parsed = salesAggregatesSchema.parse({
      totals: { gross: "0", commission: "0", transactions: 0, quantity: 0 },
      daily: [],
      byBarber: [],
      byService: [],
    });
    expect(parsed.totals.grossCentavos).toBe(0);
  });

  it.each([
    ["a float instead of exact text", { ...dbJson, totals: { ...dbJson.totals, gross: 500.1 } }],
    ["a negative amount", { ...dbJson, totals: { ...dbJson.totals, gross: "-1.00" } }],
    ["a missing section", { totals: dbJson.totals, daily: [], byBarber: [] }],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(salesAggregatesSchema.safeParse(value).success).toBe(false);
  });
});

describe("report ranges (Asia/Manila)", () => {
  it("defaults to today in Manila", () => {
    expect(parseReportRange({}, NOW)).toEqual({ ok: true, from: "2026-11-06", to: "2026-11-06", preset: "today" });
  });

  it("uses Manila's date even when UTC is still the previous day", () => {
    const lateUtc = new Date("2026-11-05T17:00:00Z"); // 1:00 AM Nov 6 in Manila
    expect(presetRange("today", lateUtc)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
  });

  it("resolves presets and recognizes them again", () => {
    expect(parseReportRange({ range: "7d" }, NOW)).toMatchObject({ from: "2026-10-31", to: "2026-11-06", preset: "7d" });
    expect(matchPreset("2026-10-08", "2026-11-06", NOW)).toBe("30d");
    expect(matchPreset("2026-11-01", "2026-11-03", NOW)).toBeNull();
  });

  it("accepts an explicit range", () => {
    expect(parseReportRange({ from: "2026-11-01", to: "2026-11-03" }, NOW)).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-03",
      preset: null,
    });
  });

  it.each([
    ["only a start date", { from: "2026-11-01" }, "to"],
    ["only an end date", { to: "2026-11-01" }, "from"],
    ["reversed dates", { from: "2026-11-05", to: "2026-11-01" }, "to"],
    ["an impossible date", { from: "2026-02-30", to: "2026-03-01" }, "from"],
    ["a range over 366 days", { from: "2024-01-01", to: "2026-01-01" }, "to"],
    ["an unknown preset", { range: "1y" }, "range"],
  ])("rejects %s", (_label, params, field) => {
    const result = parseReportRange(params, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields[field]).toBeTruthy();
  });
});

describe("dashboard components", () => {
  it("KPI cards show zeros for an empty report", () => {
    render(<KpiCards totals={buildSalesReport(EMPTY_AGGREGATES, "2026-11-06", "2026-11-06").totals} />);
    expect(screen.getByTestId("kpi-Gross sales")).toHaveTextContent("₱0.00");
    expect(screen.getByTestId("kpi-Transactions")).toHaveTextContent("0");
    expect(screen.getByTestId("kpi-Barber commissions")).toHaveTextContent("₱0.00");
    expect(screen.getByTestId("kpi-Average transaction")).toHaveTextContent("₱0.00");
    expect(screen.getByText("No sales yet")).toBeInTheDocument();
  });

  it("KPI cards show exact populated values", () => {
    render(
      <KpiCards
        totals={{ grossCentavos: 125_050, transactionCount: 5, commissionCentavos: 50_020, averageTransactionCentavos: 25_010, servicesPerformed: 6 }}
      />,
    );
    expect(screen.getByTestId("kpi-Gross sales")).toHaveTextContent("₱1,250.50");
    expect(screen.getByTestId("kpi-Transactions")).toHaveTextContent("5");
    expect(screen.getByTestId("kpi-Barber commissions")).toHaveTextContent("₱500.20");
    expect(screen.getByTestId("kpi-Average transaction")).toHaveTextContent("₱250.10");
    expect(screen.getByText("40% of gross sales")).toBeInTheDocument();
    expect(screen.getByText("6 services performed")).toBeInTheDocument();
  });

  it("trend chart explains that one day has no trend instead of drawing one point", () => {
    render(<RevenueTrendChart daily={[{ date: "2026-11-06", grossCentavos: 0, commissionCentavos: 0, transactionCount: 0 }]} />);
    expect(screen.getByText(/two or more days/)).toBeInTheDocument();
  });

  it("trend chart offers a table view with every day's exact values", () => {
    const report = buildSalesReport(
      {
        ...EMPTY_AGGREGATES,
        totals: { grossCentavos: 50_000, commissionCentavos: 20_000, transactions: 1, quantity: 2 },
        daily: [{ date: "2026-11-02", grossCentavos: 50_000, commissionCentavos: 20_000, transactions: 1 }],
      },
      "2026-11-01",
      "2026-11-03",
    );
    render(<RevenueTrendChart daily={report.daily} />);
    expect(screen.getByText("View as table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 days
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
  });
});

describe("chart display helpers", () => {
  it.each([
    [3_710, [0, 1_000, 2_000, 3_000, 4_000]],
    [950, [0, 250, 500, 750, 1_000]],
    [1_549.96, [0, 500, 1_000, 1_500, 2_000]],
    [120, [0, 50, 100, 150]],
    [0, [0, 250, 500, 750, 1_000]],
  ])("niceTicks(%d) gives clean round ticks", (max, expected) => {
    expect(niceTicks(max)).toEqual(expected);
  });

  it("formats shares with one decimal so table columns align", () => {
    expect(formatShare(3_369)).toBe("33.7%");
    expect(formatShare(970)).toBe("9.7%");
    expect(formatShare(10_000)).toBe("100.0%");
    expect(formatShare(0)).toBe("0.0%");
    expect(formatShare(404)).toBe("4.0%");
  });
});
