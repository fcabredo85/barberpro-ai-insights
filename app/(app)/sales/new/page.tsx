import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { SaleForm } from "@/components/sales/sale-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/session";
import { listBarbers, listServices } from "@/lib/db/catalog";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";

export const metadata: Metadata = { title: "New sale" };

export default async function NewSalePage() {
  const { workspace } = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const [barbers, services] = await Promise.all([
    listBarbers(supabase, workspace.barbershopId, { activeOnly: true }),
    listServices(supabase, workspace.barbershopId, { activeOnly: true }),
  ]);
  const ready = barbers.length > 0 && services.length > 0;

  return (
    <>
      <PageHeader
        title="New sale"
        description="Record a completed service. Payments are recorded only; this app never charges customers."
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Sale details</CardTitle>
          <CardDescription>Price and commission are taken from your current catalog.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <SaleForm
              services={services.map((s) => ({ id: s.id, name: s.name, value: s.priceCentavos }))}
              barbers={barbers.map((b) => ({ id: b.id, name: b.name, value: b.commissionRateBp }))}
            />
          ) : (
            <div className="space-y-3 rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {barbers.length === 0 && services.length === 0
                  ? "Add at least one barber and one service before recording sales."
                  : barbers.length === 0
                    ? "Add or reactivate at least one barber before recording sales."
                    : "Add or reactivate at least one service before recording sales."}
              </p>
              <Button asChild>
                <Link href="/settings">Go to settings</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
