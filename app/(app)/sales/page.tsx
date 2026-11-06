import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sales" };

const COLUMNS = ["Date", "Barber", "Service", "Qty", "Gross", "Commission", "Method"] as const;

export default function SalesPage() {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Recent recorded transactions. Date-range filtering is coming soon."
        actions={
          <Button asChild>
            <Link href="/sales/new">New sale</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col} scope="col" className="px-4 py-3 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-muted-foreground">
                  No sales recorded yet.
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
