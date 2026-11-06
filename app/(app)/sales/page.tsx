import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireWorkspace } from "@/lib/auth/session";
import { addDays, formatManilaDateTime, manilaDateRangeToUtc, manilaToday } from "@/lib/business/dates";
import { formatPeso } from "@/lib/business/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/business/sale";
import { SALES_PAGE_LIMIT, listSales } from "@/lib/db/sales";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { dateRangeSchema, issuesByField } from "@/lib/validation/sales";

export const metadata: Metadata = { title: "Sales" };

interface SalesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const COLUMNS = ["Date", "Service", "Barber", "Qty", "Payment", "Total", "Commission"] as const;

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();

  const today = manilaToday();
  const defaults = { from: addDays(today, -6), to: today };
  const requested = {
    from: typeof params.from === "string" && params.from ? params.from : defaults.from,
    to: typeof params.to === "string" && params.to ? params.to : defaults.to,
  };
  const parsed = dateRangeSchema.safeParse(requested);
  const range = parsed.success ? parsed.data : defaults;
  const rangeErrors = parsed.success ? null : issuesByField(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { sales, truncated } = await listSales(supabase, workspace.barbershopId, manilaDateRangeToUtc(range.from, range.to));

  const totals = sales.reduce(
    (acc, s) => ({ gross: acc.gross + s.grossCentavos, commission: acc.commission + s.commissionCentavos }),
    { gross: 0, commission: 0 },
  );

  return (
    <>
      <PageHeader
        title="Sales"
        description="Recorded transactions, shown in Asia/Manila time."
        actions={
          <Button asChild>
            <Link href="/sales/new">New sale</Link>
          </Button>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter sales by date">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={requested.from} max={today} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={requested.to} max={today} className="w-40" />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {params.from || params.to ? (
          <Button asChild variant="ghost">
            <Link href="/sales">Last 7 days</Link>
          </Button>
        ) : null}
      </form>
      {rangeErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {rangeErrors.to ?? rangeErrors.from} Showing the last 7 days instead.
        </p>
      ) : null}

      <section aria-label="Totals for this period" className="grid grid-cols-3 gap-3">
        {[
          ["Transactions", String(sales.length)],
          ["Gross sales", formatPeso(totals.gross)],
          ["Commissions", formatPeso(totals.commission)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="p-3 pb-0 sm:p-4 sm:pb-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 sm:p-4 sm:pt-1">
              <p className="text-base font-semibold tabular-nums sm:text-xl">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {truncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the {SALES_PAGE_LIMIT} most recent sales in this period; totals cover those sales only. Narrow the
          dates to see more.
        </p>
      ) : null}

      {sales.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sales recorded between {range.from} and {range.to}.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {sales.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="block rounded-lg border bg-card p-3 hover:bg-accent">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">
                      {sale.serviceName}
                      {sale.quantity > 1 ? ` × ${sale.quantity}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">{formatPeso(sale.grossCentavos)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {sale.barberName} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                    </span>
                    <span>{formatManilaDateTime(sale.occurredAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <Card className="hidden md:block">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    {COLUMNS.map((col) => (
                      <th
                        key={col}
                        scope="col"
                        className={`px-4 py-3 font-medium ${["Qty", "Total", "Commission"].includes(col) ? "text-right" : ""}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/sales/${sale.id}`} className="underline-offset-4 hover:underline">
                          {formatManilaDateTime(sale.occurredAt)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{sale.serviceName}</td>
                      <td className="px-4 py-3">{sale.barberName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{sale.quantity}</td>
                      <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPeso(sale.grossCentavos)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatPeso(sale.commissionCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
