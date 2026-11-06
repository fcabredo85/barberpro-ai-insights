import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder zeros until metrics come from the database. No sample data is invented.
const KPIS = [
  { label: "Gross sales", value: "₱0.00" },
  { label: "Transactions", value: "0" },
  { label: "Commissions", value: "₱0.00" },
  { label: "Avg. transaction", value: "₱0.00" },
] as const;

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Today's performance (Asia/Manila)." />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="p-4 pb-1">
              <CardDescription>{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xl font-semibold tabular-nums sm:text-2xl">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales trend</CardTitle>
            <CardDescription>Gross sales per day</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={[]} />
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
            <p>Record some sales first. Insights need enough data to be meaningful.</p>
            <Button variant="outline" size="sm" disabled>
              Generate insights
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {["Sales by barber", "Sales by service"].map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No sales yet.</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
