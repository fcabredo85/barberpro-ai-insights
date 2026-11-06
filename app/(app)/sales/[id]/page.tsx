import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { PrintButton } from "@/components/sales/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/session";
import { formatManilaDateTime } from "@/lib/business/dates";
import { formatPercent, formatPeso } from "@/lib/business/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/business/sale";
import { getSale } from "@/lib/db/sales";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { recordIdSchema } from "@/lib/validation/catalog";

export const metadata: Metadata = { title: "Sale receipt" };

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReceiptPage({ params, searchParams }: ReceiptPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace();

  const parsedId = recordIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createSupabaseServerClient();
  // RLS + explicit tenant filter: another shop's sale is indistinguishable from a missing one.
  const sale = await getSale(supabase, workspace.barbershopId, parsedId.data);
  if (!sale) notFound();

  const justRecorded = query.recorded === "1";
  const rows: Array<[string, string]> = [
    ["Date", formatManilaDateTime(sale.occurredAt)],
    ["Service", sale.serviceName],
    ["Barber", sale.barberName],
    ["Unit price", formatPeso(sale.unitPriceCentavos)],
    ["Quantity", String(sale.quantity)],
    ["Payment", `${PAYMENT_METHOD_LABELS[sale.paymentMethod]} (received)`],
  ];

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {justRecorded ? (
        <p role="status" className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm print:hidden">
          <CheckCircle2 className="h-4 w-4 text-chart-2" aria-hidden="true" />
          Sale recorded.
        </p>
      ) : null}

      <Card>
        <CardHeader className="text-center">
          <CardTitle>{workspace.name}</CardTitle>
          <CardDescription>Sales record: not an official receipt</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between border-t pt-4">
            <span className="font-medium">Total</span>
            <span className="text-2xl font-semibold tabular-nums">{formatPeso(sale.grossCentavos)}</span>
          </div>
          <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Commission ({formatPercent(sale.commissionRateBp)})</span>
            <span className="font-medium tabular-nums">{formatPeso(sale.commissionCentavos)}</span>
          </div>
          <p className="break-all text-center text-xs text-muted-foreground">Ref: {sale.id}</p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <Button asChild>
          <Link href="/sales/new">Record another sale</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sales">Sales history</Link>
        </Button>
        <PrintButton />
      </div>
    </div>
  );
}
