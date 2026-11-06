"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  /** Display label for the Manila-local day, e.g. "Nov 6". */
  day: string;
  /** Gross sales for the day, in pesos (display only). */
  gross: number;
}

interface SalesTrendChartProps {
  data: readonly TrendPoint[];
}

export function SalesTrendChart({ data }: SalesTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
        No sales recorded for this period yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
          <Tooltip cursor={{ fillOpacity: 0.1 }} />
          <Bar dataKey="gross" name="Gross sales" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
