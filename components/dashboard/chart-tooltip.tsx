import type { ReactNode } from "react";

interface ChartTooltipProps {
  title: string;
  rows: ReadonlyArray<{ label: string; value: string; keyed?: boolean }>;
}

/**
 * Tooltip body: values lead (strong), labels follow (secondary). The first
 * row may carry a short line key in the series color. Text uses text tokens.
 */
export function ChartTooltip({ title, rows }: ChartTooltipProps): ReactNode {
  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 text-muted-foreground">{title}</p>
      <dl className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {row.keyed ? (
                <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full bg-[var(--viz-series-1)]" />
              ) : null}
              {row.label}
            </dt>
            <dd className="font-semibold tabular-nums text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
