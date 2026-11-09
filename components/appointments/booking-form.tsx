"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CalendarCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAppointmentWhen, formatSlotTime } from "@/lib/booking/rules";
import { cn } from "@/lib/utils";

export interface BookingOption {
  id: string;
  name: string;
}

export interface BookingServiceOption extends BookingOption {
  priceLabel: string;
  durationMinutes: number;
}

export interface BookingLook {
  id: string;
  customerLabel: string;
  styleName: string;
  previewUrl: string | null;
}

interface BookingFormProps {
  barbers: BookingOption[];
  services: BookingServiceOption[];
  today: string;
  maxDate: string;
  look?: BookingLook;
  /** Hairstyle carried from the studio without saving photos. */
  style?: { id: string; name: string };
}

type SlotsState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; slots: string[] } | { kind: "error"; message: string };

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "confirmed"; appointmentId: string; startsAt: string; endsAt: string }
  | { kind: "error"; message: string; fields?: Record<string, string> };

/**
 * Book This Style (FR-14). Times come from the server's availability check;
 * "Confirmed" is shown only after the server creates the appointment.
 */
export function BookingForm({ barbers, services, today, maxDate, look, style }: BookingFormProps) {
  const id = useId();
  const [customerName, setCustomerName] = useState(look?.customerLabel ?? "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [barberId, setBarberId] = useState(barbers.length === 1 ? barbers[0]!.id : "");
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0]!.id : "");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const [slotsVersion, setSlotsVersion] = useState(0);
  // Results and the chosen time are stored with the query they belong to, so
  // changing barber/service/date shows "loading" and clears the time without
  // extra effects.
  const slotsKey = barberId && serviceId && date ? `${barberId}|${serviceId}|${date}|${slotsVersion}` : null;
  const [fetched, setFetched] = useState<{ key: string; state: SlotsState } | null>(null);
  const [selected, setSelected] = useState<{ key: string; slot: string } | null>(null);
  const slots: SlotsState = !slotsKey ? { kind: "idle" } : fetched?.key === slotsKey ? fetched.state : { kind: "loading" };
  const startsAt = slotsKey && selected?.key === slotsKey ? selected.slot : "";
  const setStartsAt = (slot: string) => slotsKey && setSelected({ key: slotsKey, slot });
  // One key per booking attempt: a retried request can't create a second appointment.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  useEffect(() => {
    if (!slotsKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ barberId, serviceId, date });
    fetch(`/api/appointments/availability?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        setFetched({
          key: slotsKey,
          state:
            res.ok && Array.isArray(body?.data?.slots)
              ? { kind: "ready", slots: body.data.slots }
              : { kind: "error", message: body?.error?.message ?? "Couldn't load available times." },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({ key: slotsKey, state: { kind: "error", message: "Network error. Check your connection and try again." } });
      });
    return () => controller.abort();
  }, [slotsKey, barberId, serviceId, date]);

  async function book(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !startsAt) return;
    inFlight.current = true;
    setSubmit({ kind: "submitting" });
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId,
          serviceId,
          startsAt,
          customerName,
          ...(customerPhone.trim() && { customerPhone }),
          ...(notes.trim() && { notes }),
          ...(look ? { savedLookId: look.id } : style ? { styleId: style.id } : {}),
          requestKey,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data?.status === "confirmed") {
        setSubmit({ kind: "confirmed", appointmentId: body.data.appointmentId, startsAt: body.data.startsAt, endsAt: body.data.endsAt });
      } else {
        setSubmit({ kind: "error", message: body?.error?.message ?? "Couldn't book the appointment. Please try again.", fields: body?.error?.fields });
        if (res.status === 409 || body?.error?.fields?.startsAt) {
          // The time is gone: refresh availability and use a new key for the next attempt.
          setRequestKey(crypto.randomUUID());
          setSlotsVersion((v) => v + 1);
        }
      }
    } catch {
      // Keep the same request key: retrying can't double-book.
      setSubmit({ kind: "error", message: "Network error. The booking may not have gone through; try again to check." });
    } finally {
      inFlight.current = false;
    }
  }

  function bookAnother() {
    setSubmit({ kind: "idle" });
    setRequestKey(crypto.randomUUID());
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setSlotsVersion((v) => v + 1);
  }

  if (submit.kind === "confirmed") {
    return (
      <div role="status" className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Appointment confirmed
        </p>
        <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-muted-foreground">Customer</dt>
          <dd>{customerName.trim()}</dd>
          <dt className="text-muted-foreground">When</dt>
          <dd>{formatAppointmentWhen(submit.startsAt, submit.endsAt)}</dd>
          <dt className="text-muted-foreground">Barber</dt>
          <dd>{barbers.find((b) => b.id === barberId)?.name}</dd>
          <dt className="text-muted-foreground">Service</dt>
          <dd>{services.find((s) => s.id === serviceId)?.name}</dd>
          {look || style ? (
            <>
              <dt className="text-muted-foreground">Style</dt>
              <dd>{look?.styleName ?? style?.name}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">Confirmed</dd>
          <dt className="text-muted-foreground">Booking ID</dt>
          <dd className="break-all font-mono text-xs">{submit.appointmentId}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/appointments?date=${date}`}>View appointments</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={bookAnother}>
            Book another
          </Button>
        </div>
      </div>
    );
  }

  const submitting = submit.kind === "submitting";
  const fields = submit.kind === "error" ? submit.fields : undefined;
  const selectedService = services.find((s) => s.id === serviceId);
  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

  if (barbers.length === 0 || services.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Add at least one active barber and service in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          Settings
        </Link>{" "}
        before booking appointments.
      </p>
    );
  }

  return (
    <form onSubmit={book} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6" aria-busy={submitting}>
      {look || style ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          {look?.previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */
            <img src={look.previewUrl} alt={`AI-generated simulation of a ${look.styleName}`} className="h-16 w-16 rounded-md border object-cover" />
          ) : null}
          <div>
            <p className="font-medium">Style: {look?.styleName ?? style?.name}</p>
            <p className="text-xs text-muted-foreground">
              {look ? "Saved look attached to this booking." : "Chosen in the Try-On Studio (photos not saved)."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-name`}>Customer name</Label>
          <Input id={`${id}-name`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} required autoComplete="off" disabled={submitting} aria-invalid={fields?.customerName ? true : undefined} />
          {fields?.customerName ? <p className="text-xs text-destructive">{fields.customerName}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-phone`}>Phone (optional)</Label>
          <Input id={`${id}-phone`} type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={20} autoComplete="off" disabled={submitting} aria-invalid={fields?.customerPhone ? true : undefined} />
          {fields?.customerPhone ? <p className="text-xs text-destructive">{fields.customerPhone}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-barber`}>Barber</Label>
          <select id={`${id}-barber`} className={selectClass} value={barberId} onChange={(e) => setBarberId(e.target.value)} required disabled={submitting}>
            <option value="">Choose a barber</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-service`}>Service</Label>
          <select id={`${id}-service`} className={selectClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)} required disabled={submitting}>
            <option value="">Choose a service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.priceLabel} · {s.durationMinutes} min
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-date`}>Date</Label>
          <Input id={`${id}-date`} type="date" value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)} required disabled={submitting} />
        </div>
      </div>

      <fieldset className="min-w-0 space-y-2" disabled={submitting}>
        <legend className="text-sm font-medium">Available times</legend>
        <p className="text-xs text-muted-foreground">
          Bookings run 10:00 AM – 9:00 PM (Asia/Manila).{selectedService ? ` ${selectedService.name} takes ${selectedService.durationMinutes} minutes.` : ""}
        </p>
        <div aria-live="polite">
          {slots.kind === "idle" ? <p className="text-sm text-muted-foreground">Choose a barber, service and date to see open times.</p> : null}
          {slots.kind === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking availability…
            </p>
          ) : null}
          {slots.kind === "error" ? <p role="alert" className="text-sm text-destructive">{slots.message}</p> : null}
          {slots.kind === "ready" && slots.slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open times on this date. Try another date or barber.</p>
          ) : null}
          {slots.kind === "ready" && slots.slots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {slots.slots.map((slot) => (
                <label
                  key={slot}
                  className={cn(
                    "cursor-pointer rounded-md border px-2 py-1.5 text-center text-sm focus-within:ring-2 focus-within:ring-ring",
                    startsAt === slot ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                  )}
                >
                  <input type="radio" name={`${id}-slot`} value={slot} checked={startsAt === slot} onChange={() => setStartsAt(slot)} className="sr-only" />
                  {formatSlotTime(slot)}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Notes for the barber (optional)</Label>
        <textarea
          id={`${id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={submitting}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {submit.kind === "error" ? (
        <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {submit.message}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting || !startsAt || !customerName.trim()}>
        {submitting ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
        {submitting ? "Booking…" : "Confirm booking"}
      </Button>
    </form>
  );
}
