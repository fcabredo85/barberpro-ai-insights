"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CheckCircle2, Loader2, UserX, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AppointmentActionsProps {
  appointmentId: string;
  customerName: string;
  /** Whether the start time has passed (no-show is only allowed then). */
  started: boolean;
}

/** Complete (records the sale), mark no-show, or cancel a confirmed appointment. */
export function AppointmentActions({ appointmentId, customerName, started }: AppointmentActionsProps) {
  const router = useRouter();
  const id = useId();
  const [completing, setCompleting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash" | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setCompleting(false);
        router.refresh();
      } else {
        setError(json?.error?.message ?? "Couldn't update the appointment. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (completing) {
    return (
      <div className="space-y-2">
        <fieldset className="flex flex-wrap items-center gap-3 text-sm" disabled={busy}>
          <legend className="sr-only">How did {customerName} pay?</legend>
          <span className="font-medium">Paid by:</span>
          {(["cash", "gcash"] as const).map((method) => (
            <label key={method} className="flex items-center gap-1.5">
              <input type="radio" name={`${id}-payment`} value={method} checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} className="accent-primary" />
              {method === "cash" ? "Cash" : "GCash"}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">Records a sale at the current price and commission rate. No payment is processed.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || !paymentMethod} onClick={() => paymentMethod && send({ action: "complete", paymentMethod })}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Complete and record sale
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setCompleting(false)}>
            Back
          </Button>
        </div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => setCompleting(true)} aria-label={`Complete ${customerName}'s appointment`}>
          <CheckCircle2 />
          Complete
        </Button>
        {started ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => send({ action: "no_show" })} aria-label={`Mark ${customerName} as a no-show`}>
            <UserX />
            No-show
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`Cancel ${customerName}'s appointment`}
          onClick={() => {
            if (window.confirm(`Cancel ${customerName}'s appointment? The time becomes available again.`)) void send({ action: "cancel" });
          }}
        >
          <XCircle />
          Cancel
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
