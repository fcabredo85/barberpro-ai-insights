"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RANGE_PRESETS, type RangePresetKey } from "@/lib/business/report-range";
import { cn } from "@/lib/utils";

interface DashboardFrameProps {
  from: string;
  to: string;
  preset: RangePresetKey | null;
  today: string;
  rangeError?: string;
  children: ReactNode;
}

/**
 * One filter row above everything it scopes. Navigation runs in a transition:
 * while new data loads, the current view stays in place at reduced opacity
 * (no skeleton flash, no layout jump). Works without JavaScript too: presets
 * are links and the custom range is a GET form.
 */
export function DashboardFrame({ from, to, preset, today, rangeError, children }: DashboardFrameProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href, { scroll: false }));
  }

  function onPresetClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  }

  function onCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({ from: String(data.get("from") ?? ""), to: String(data.get("to") ?? "") });
    navigate(`/dashboard?${params.toString()}`);
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Date range presets" className="grid grid-cols-4 gap-1 rounded-lg border bg-card p-1 sm:inline-grid sm:w-auto">
          {RANGE_PRESETS.map((p) => {
            const href = `/dashboard?range=${p.key}`;
            const active = preset === p.key;
            return (
              <Link
                key={p.key}
                href={href}
                onClick={(e) => onPresetClick(e, href)}
                aria-current={active ? "true" : undefined}
                aria-label={p.description[0]!.toUpperCase() + p.description.slice(1)}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1.5 text-center text-sm font-medium transition-colors sm:px-3",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        <form
          method="get"
          action="/dashboard"
          onSubmit={onCustomSubmit}
          className="flex flex-wrap items-end gap-2"
          aria-label="Custom date range"
          key={`${from}-${to}`}
        >
          <div className="space-y-1">
            <Label htmlFor="dash-from" className="text-xs text-muted-foreground">From</Label>
            <Input id="dash-from" name="from" type="date" defaultValue={from} max={today} className="w-[9.5rem]" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to" className="text-xs text-muted-foreground">To</Label>
            <Input id="dash-to" name="to" type="date" defaultValue={to} max={today} className="w-[9.5rem]" required />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Apply
          </Button>
        </form>
      </div>

      {rangeError ? (
        <p role="alert" className="text-sm text-destructive">
          {rangeError} Showing today instead.
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {pending ? "Updating dashboard…" : ""}
      </p>
      <div
        aria-busy={pending}
        className={cn("space-y-6 transition-opacity duration-200", pending && "pointer-events-none opacity-50")}
      >
        {children}
      </div>
    </>
  );
}
