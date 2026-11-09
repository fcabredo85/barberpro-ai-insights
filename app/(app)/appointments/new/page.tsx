import type { Metadata } from "next";

import { BookingForm } from "@/components/appointments/booking-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireWorkspace } from "@/lib/auth/session";
import { BOOKING_MAX_DAYS_AHEAD } from "@/lib/booking/rules";
import { addDays, manilaToday } from "@/lib/business/dates";
import { formatPeso } from "@/lib/business/money";
import { listBarbers, listServices } from "@/lib/db/catalog";
import { getSavedLookForBooking } from "@/lib/db/looks";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { getHairstyle, isHairstyleId } from "@/lib/tryon/styles";
import { lookIdSchema } from "@/lib/validation/looks";

export const metadata: Metadata = { title: "Book appointment" };
export const dynamic = "force-dynamic";

interface NewAppointmentPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewAppointmentPage({ searchParams }: NewAppointmentPageProps) {
  const params = await searchParams;
  const { workspace } = await requireWorkspace();
  const supabase = await createSupabaseServerClient();

  const lookId = typeof params.lookId === "string" && lookIdSchema.safeParse(params.lookId).success ? params.lookId : null;
  const styleId = typeof params.styleId === "string" && isHairstyleId(params.styleId) ? params.styleId : null;

  const [barbers, services, look] = await Promise.all([
    listBarbers(supabase, workspace.barbershopId, { activeOnly: true }),
    listServices(supabase, workspace.barbershopId, { activeOnly: true }),
    lookId ? getSavedLookForBooking(supabase, lookId) : Promise.resolve(null),
  ]);
  const today = manilaToday();

  return (
    <>
      <PageHeader title="Book appointment" description={`Book a confirmed appointment at ${workspace.name}. Only genuinely open times are shown.`} />
      {lookId && !look ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          That saved look no longer exists. You can still book without it.
        </p>
      ) : null}
      <BookingForm
        barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
        services={services.map((s) => ({ id: s.id, name: s.name, priceLabel: formatPeso(s.priceCentavos), durationMinutes: s.durationMinutes }))}
        today={today}
        maxDate={addDays(today, BOOKING_MAX_DAYS_AHEAD)}
        look={look ?? undefined}
        style={!look && styleId ? { id: styleId, name: getHairstyle(styleId).name } : undefined}
      />
    </>
  );
}
