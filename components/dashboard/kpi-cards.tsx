import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { MetricsTotals } from "@/lib/business/metrics";
import { formatPercent, formatPeso } from "@/lib/business/money";
import { divideRoundHalfUp } from "@/lib/business/money";

interface KpiCardsProps {
  totals: MetricsTotals;
}

export function KpiCards({ totals }: KpiCardsProps) {
  const commissionShare =
    totals.grossCentavos > 0 ? divideRoundHalfUp(totals.commissionCentavos * 10_000, totals.grossCentavos) : 0;

  const tiles = [
    {
      label: "Gross sales",
      value: formatPeso(totals.grossCentavos),
      note: `${totals.servicesPerformed} ${totals.servicesPerformed === 1 ? "service" : "services"} performed`,
    },
    {
      label: "Transactions",
      value: totals.transactionCount.toLocaleString("en-PH"),
      note: "Recorded sales",
    },
    {
      label: "Barber commissions",
      value: formatPeso(totals.commissionCentavos),
      note: totals.grossCentavos > 0 ? `${formatPercent(commissionShare)} of gross sales` : "No sales yet",
    },
    {
      label: "Average transaction",
      value: formatPeso(totals.averageTransactionCentavos),
      note: "Gross sales ÷ transactions",
    },
  ];

  return (
    <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="p-4 pb-1">
            <h2 className="text-sm text-muted-foreground">{tile.label}</h2>
          </CardHeader>
          <CardContent className="space-y-1 p-4 pt-0">
            <p className="break-words text-xl font-semibold sm:text-2xl" data-testid={`kpi-${tile.label}`}>
              {tile.value}
            </p>
            <p className="text-xs text-muted-foreground">{tile.note}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
