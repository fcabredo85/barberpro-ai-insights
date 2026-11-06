import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { BreakdownChart } from "@/components/dashboard/breakdown-chart";
import { DashboardFrame } from "@/components/dashboard/dashboard-frame";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/session";
import { formatCalendarDateLong, manilaToday } from "@/lib/business/dates";
import { RANGE_PRESETS } from "@/lib/business/report-range";
import { getSalesReport } from "@/lib/db/metrics";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { parseReportRange } from "@/lib/validation/report-range";

export const metadata: Metadata = { title: "Dashboard" };

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function rangeLabel(from: string, to: string, presetDescription?: string): string {
  if (presetDescription === "today") return `today, ${formatCalendarDateLong(to)}`;
  if (presetDescription) return presetDescription;
  return from === to ? formatCalendarDateLong(from) : `${formatCalendarDateLong(from)} – ${formatCalendarDateLong(to)}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();

  const requested = parseReportRange(params);
  const range = requested.ok ? requested : parseReportRange({});
  if (!range.ok) throw new Error("Default report range is invalid");
  const rangeError = requested.ok ? undefined : Object.values(requested.fields)[0];

  const supabase = await createSupabaseServerClient();
  const report = await getSalesReport(supabase, workspace.barbershopId, range.from, range.to);

  const presetDescription = RANGE_PRESETS.find((p) => p.key === range.preset)?.description;
  const label = rangeLabel(range.from, range.to, presetDescription);

  return (
    <>
      <PageHeader title="Dashboard" description={`${workspace.name}: ${label} (Asia/Manila time).`} />

      <DashboardFrame from={range.from} to={range.to} preset={range.preset} today={manilaToday()} rangeError={rangeError}>
        {report.isEmpty ? (
          <div role="status" className="flex flex-col gap-3 rounded-lg border border-dashed bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              No sales recorded for {label}. Totals show ₱0.00 until you record a sale.
            </p>
            <Button asChild size="sm">
              <Link href="/sales/new">Record a sale</Link>
            </Button>
          </div>
        ) : null}

        <KpiCards totals={report.totals} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Revenue trend</CardTitle>
              <CardDescription>Gross sales per day</CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueTrendChart daily={report.daily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                AI insights
              </CardTitle>
              <CardDescription>Suggestions based on your recorded sales.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Coming in the next milestone: three data-backed suggestions for the selected range.</p>
              <Button variant="outline" size="sm" disabled>
                Generate insights
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {(
            [
              ["Sales by barber", "Gross sales and commission earned per barber", report.byBarber, "barber"],
              ["Sales by service", "Gross sales per service", report.byService, "service"],
            ] as const
          ).map(([title, description, rows, noun]) => (
            <Card key={title} className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length > 0 ? (
                  <BreakdownChart rows={rows} noun={noun} />
                ) : (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No sales in this range.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </DashboardFrame>
    </>
  );
}
