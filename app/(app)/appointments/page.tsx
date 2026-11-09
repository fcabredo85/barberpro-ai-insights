import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { AppointmentActions } from "@/components/appointments/appointment-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/session";
import { STATUS_LABEL, formatSlotTime } from "@/lib/booking/rules";
import { addDays, formatCalendarDateLong, isValidIsoDate, manilaToday } from "@/lib/business/dates";
import { listAppointmentsForDay } from "@/lib/db/appointments";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Appointments" };
export const dynamic = "force-dynamic";

interface AppointmentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_STYLE = {
  confirmed: "border-transparent bg-primary text-primary-foreground",
  completed: "border-transparent bg-secondary text-secondary-foreground",
  cancelled: "text-muted-foreground line-through",
  no_show: "text-destructive",
} as const;

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const today = manilaToday();
  const date = typeof params.date === "string" && isValidIsoDate(params.date) ? params.date : today;

  const supabase = await createSupabaseServerClient();
  const appointments = await listAppointmentsForDay(supabase, workspace.barbershopId, date);

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`${formatCalendarDateLong(date)} (Asia/Manila). Bookings run 10:00 AM – 9:00 PM.`}
        actions={
          <Button asChild size="sm">
            <Link href="/appointments/new">
              <CalendarPlus />
              Book appointment
            </Link>
          </Button>
        }
      />

      <nav aria-label="Choose day" className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/appointments?date=${addDays(date, -1)}`} aria-label="Previous day">
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant={date === today ? "default" : "outline"} size="sm">
          <Link href={`/appointments?date=${today}`}>Today</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/appointments?date=${addDays(date, 1)}`} aria-label="Next day">
            <ChevronRight />
          </Link>
        </Button>
        <form className="flex items-center gap-2" action="/appointments">
          <label htmlFor="appointments-date" className="sr-only">
            Go to date
          </label>
          <input id="appointments-date" type="date" name="date" defaultValue={date} className="h-8 rounded-md border border-input bg-background px-2 text-sm" />
          <Button type="submit" variant="ghost" size="sm">
            Go
          </Button>
        </form>
      </nav>

      {appointments.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">No appointments on this day.</p>
      ) : (
        <ol className="space-y-3">
          {appointments.map((a) => (
            <li key={a.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {formatSlotTime(a.startsAt)} – {formatSlotTime(a.endsAt)}
                  </span>
                  <Badge variant="outline" className={cn(STATUS_STYLE[a.status])}>
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </p>
                <p className="truncate">
                  <span className="font-medium">{a.customerName}</span>
                  {a.customerPhone ? <span className="text-muted-foreground"> · {a.customerPhone}</span> : null}
                </p>
                <p className="text-muted-foreground">
                  {a.serviceName} with {a.barberName}
                  {a.styleName ? ` · Style: ${a.styleName}` : ""}
                  {a.savedLookId ? (
                    <>
                      {" · "}
                      <Link href="/studio/looks" className="underline underline-offset-4">
                        saved look
                      </Link>
                    </>
                  ) : null}
                </p>
                {a.notes ? <p className="whitespace-pre-line text-muted-foreground">Notes: {a.notes}</p> : null}
                {a.saleId ? (
                  <Link href={`/sales/${a.saleId}`} className="text-xs underline underline-offset-4">
                    View recorded sale
                  </Link>
                ) : null}
              </div>
              {a.status === "confirmed" ? (
                <AppointmentActions appointmentId={a.id} customerName={a.customerName} started={a.started} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
