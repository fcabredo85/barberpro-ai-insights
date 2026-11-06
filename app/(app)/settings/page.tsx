import type { Metadata } from "next";

import { CatalogForm } from "@/components/catalog/catalog-form";
import { CatalogList } from "@/components/catalog/catalog-list";
import type { CatalogItem } from "@/components/catalog/catalog-config";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/auth/session";
import {
  basisPointsToPercentInput,
  centavosToPesoInput,
  formatPercent,
  formatPeso,
} from "@/lib/business/money";
import { listBarbers, listServices } from "@/lib/db/catalog";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const [barbers, services] = await Promise.all([
    listBarbers(supabase, workspace.barbershopId),
    listServices(supabase, workspace.barbershopId),
  ]);
  const isOwner = workspace.role === "owner";

  const barberItems: CatalogItem[] = barbers.map((b) => ({
    id: b.id,
    name: b.name,
    detail: `${formatPercent(b.commissionRateBp)} commission`,
    active: b.active,
    editValues: { name: b.name, commissionRate: basisPointsToPercentInput(b.commissionRateBp) },
  }));
  const serviceItems: CatalogItem[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    detail: formatPeso(s.priceCentavos),
    active: s.active,
    editValues: { name: s.name, price: centavosToPesoInput(s.priceCentavos) },
  }));

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Manage barbers and services for ${workspace.name}. Changes apply to new sales only; past receipts keep their original prices and rates.`}
      />
      {!isOwner ? (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
          Only the owner can change barbers and services.
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Barbers</CardTitle>
            <CardDescription>Each barber&apos;s commission rate is applied when a sale is recorded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isOwner ? <CatalogForm kind="barber" /> : null}
            <CatalogList kind="barber" items={barberItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
            <CardDescription>The price is copied onto each sale when it is recorded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isOwner ? <CatalogForm kind="service" /> : null}
            <CatalogList kind="service" items={serviceItems} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
