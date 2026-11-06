"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BreakdownRow } from "@/lib/business/metrics";
import { formatPeso, formatShare } from "@/lib/business/money";
import { ChartTooltip } from "./chart-tooltip";

interface BreakdownChartProps {
  rows: readonly BreakdownRow[];
  /** e.g. "barber" or "service", used in accessible text. */
  noun: string;
}

const ROW_HEIGHT = 36;
const BAR_THICKNESS = 20; // <= 24px cap
const LABEL_WIDTH = 104; // category name column
const TIP_LABEL_ROOM = 80; // fixed space for "₱10,000.00" at the bar tip, so it never clips
const MAX_NAME_CHARS = 14;

function truncate(name: string): string {
  return name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name;
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
}

/** One line per category, truncated; the full name is in a native tooltip and the table. */
function CategoryTick({ x = 0, y = 0, payload }: TickProps) {
  const name = payload?.value ?? "";
  return (
    <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={12} fill="hsl(var(--foreground))">
      <title>{name}</title>
      {truncate(name)}
    </text>
  );
}

/**
 * Horizontal bars of gross sales per category. One hue for all bars: the
 * categories are named on the axis, so color carries no identity or rank.
 * Values sit at the bar tips; the table below carries every figure.
 */
export function BreakdownChart({ rows, noun }: BreakdownChartProps) {
  const data = rows.map((r) => ({ ...r, grossPesos: r.grossCentavos / 100 }));
  const max = Math.max(...data.map((d) => d.grossPesos), 0);
  const summary = `Gross sales by ${noun}: ${rows.map((r) => `${r.name} ${formatPeso(r.grossCentavos)}`).join(", ")}.`;

  return (
    <div className="space-y-4">
      <div className="w-full" style={{ height: data.length * ROW_HEIGHT + 8 }} role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: TIP_LABEL_ROOM, bottom: 4, left: 0 }}>
            <XAxis type="number" hide domain={[0, max > 0 ? max : 1]} />
            <YAxis
              type="category"
              dataKey="name"
              width={LABEL_WIDTH}
              tick={<CategoryTick />}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.6 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as BreakdownRow | undefined;
                if (!active || !row) return null;
                return (
                  <ChartTooltip
                    title={row.name}
                    rows={[
                      { label: "Gross sales", value: formatPeso(row.grossCentavos), keyed: true },
                      { label: "Share", value: formatShare(row.shareBp) },
                      { label: "Transactions", value: String(row.transactionCount) },
                      { label: "Commissions", value: formatPeso(row.commissionCentavos) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="grossPesos"
              name="Gross sales"
              fill="var(--viz-series-1)"
              barSize={BAR_THICKNESS}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="grossCentavos"
                position="right"
                formatter={(value: unknown) => formatPeso(Number(value))}
                style={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Sales by {noun}</caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-2 font-medium capitalize">{noun}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Sales</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Gross</th>
            <th scope="col" className="py-2 pl-2 text-right font-medium sm:pr-2">Commission</th>
            <th scope="col" className="hidden py-2 pl-2 text-right font-medium sm:table-cell">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id ?? r.name}>
              <th scope="row" className="break-words py-2 pr-2 text-left font-normal">{r.name}</th>
              <td className="px-2 py-2 text-right tabular-nums">{r.transactionCount}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatPeso(r.grossCentavos)}</td>
              <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums sm:pr-2">{formatPeso(r.commissionCentavos)}</td>
              <td className="hidden py-2 pl-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                {formatShare(r.shareBp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
