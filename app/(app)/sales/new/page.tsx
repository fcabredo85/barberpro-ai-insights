import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "New sale" };

const FIELDS = [
  { label: "Service", hint: "Active services from your catalog" },
  { label: "Barber", hint: "Active barbers in your shop" },
  { label: "Quantity", hint: "1 to 20" },
  { label: "Payment method", hint: "Cash or GCash, already paid" },
] as const;

export default function NewSalePage() {
  return (
    <>
      <PageHeader
        title="New sale"
        description="Record a completed service. This app records payments only and never charges customers."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Sale details</CardTitle>
          <CardDescription>
            The form will be enabled once your barbers and services are set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.label} className="rounded-md border border-dashed p-3">
                <dt className="text-sm font-medium">{field.label}</dt>
                <dd className="text-xs text-muted-foreground">{field.hint}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
