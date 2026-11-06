import Link from "next/link";
import { BarChart3, Percent, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Percent,
    title: "Automatic commissions",
    body: "Record a service sale and the commission is calculated from your configured rates.",
  },
  {
    icon: BarChart3,
    title: "Daily performance",
    body: "See sales, transactions and commissions by barber and service, in Manila time.",
  },
  {
    icon: Sparkles,
    title: "AI business insights",
    body: "Get suggestions backed by your own numbers, never invented figures.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-4 py-16">
      <section className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">For Philippine barbershop owners</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
          BarberPro AI Insights
        </h1>
        <p className="max-w-2xl text-muted-foreground sm:text-lg">
          Record service sales, compute barber commissions, and turn your daily numbers into
          practical recommendations. Payments are recorded only; this app never charges customers.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">View dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <Icon className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
