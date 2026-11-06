"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DailyPoint } from "@/lib/business/metrics";
import { formatCalendarDateLong, formatCalendarDateShort } from "@/lib/business/dates";
import { niceTicks } from "@/lib/business/axis";
import { formatPeso, formatPesoCompact } from "@/lib/business/money";
import { ChartTooltip } from "./chart-tooltip";

interface RevenueTrendChartProps {
  daily: readonly DailyPoint[];
}

interface ChartPoint extends DailyPoint {
  /** Chart scale only (pesos); every displayed value comes from centavos. */
  grossPesos: number;
}

const AXIS_TICK = { fill: "var(--viz-muted)", fontSize: 12 };

/** Single-series daily gross sales (Asia/Manila days). No legend: the card title names the series. */
export function RevenueTrendChart({ daily }: RevenueTrendChartProps) {
  if (daily.length < 2) {
    return (
      <div className="flex h-60 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
        Choose a range of two or more days to see the daily trend.
      </div>
    );
  }

  const data: ChartPoint[] = daily.map((d) => ({ ...d, grossPesos: d.grossCentavos / 100 }));
  const best = daily.reduce((a, b) => (b.grossCentavos > a.grossCentavos ? b : a));
  const ticks = niceTicks(best.grossCentavos / 100);
  const summary =
    best.grossCentavos > 0
      ? `Daily gross sales from ${formatCalendarDateLong(daily[0]!.date)} to ${formatCalendarDateLong(daily.at(-1)!.date)}. Highest: ${formatPeso(best.grossCentavos)} on ${formatCalendarDateLong(best.date)}.`
      : "Daily gross sales: no sales in this range.";

  return (
    <figure className="space-y-3">
      {/* Fixed height includes the x-axis band, so ticks are never clipped. */}
      <div className="h-60 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={formatCalendarDateShort}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              ticks={ticks}
              domain={[0, ticks.at(-1)!]}
              tickFormatter={(pesos: number) => formatPesoCompact(pesos * 100)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined;
                if (!active || !point) return null;
                return (
                  <ChartTooltip
                    title={formatCalendarDateLong(point.date)}
                    rows={[
                      { label: "Gross sales", value: formatPeso(point.grossCentavos), keyed: true },
                      { label: "Transactions", value: String(point.transactionCount) },
                      { label: "Commissions", value: formatPeso(point.commissionCentavos) },
                    ]}
                  />
                );
              }}
            />
            {/* Straight segments: a smoothed curve would invent sales between days. */}
            <Area
              type="linear"
              dataKey="grossPesos"
              name="Gross sales"
              stroke="var(--viz-series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="var(--viz-series-1)"
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: "var(--viz-series-1)", stroke: "var(--viz-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily gross sales, Asia/Manila</caption>
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Transactions</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Gross</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Commissions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {daily.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{formatCalendarDateLong(d.date)}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.transactionCount}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatPeso(d.grossCentavos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatPeso(d.commissionCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
