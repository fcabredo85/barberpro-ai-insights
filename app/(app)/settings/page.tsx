import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { title: "Barbershop", description: "Your workspace name." },
  { title: "Barbers", description: "Add or deactivate barbers and set their commission rates." },
  { title: "Services", description: "Add or deactivate services and set their peso prices." },
] as const;

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your barbershop, barbers and services." />
      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Coming soon.</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
