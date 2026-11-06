"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPercent, formatPeso } from "@/lib/business/money";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  calculateSale,
  type PaymentMethod,
} from "@/lib/business/sale";
import { cn } from "@/lib/utils";

export interface SaleFormOption {
  id: string;
  name: string;
  /** Price in centavos (services) or rate in basis points (barbers). */
  value: number;
}

interface SaleFormProps {
  services: readonly SaleFormOption[];
  barbers: readonly SaleFormOption[];
}

interface ApiErrorResponse {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 aria-[invalid=true]:border-destructive md:text-sm";

function newRequestKey(): string {
  return crypto.randomUUID();
}

export function SaleForm({ services, barbers }: SaleFormProps) {
  const router = useRouter();
  const uid = useId();
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0]!.id : "");
  const [barberId, setBarberId] = useState(barbers.length === 1 ? barbers[0]!.id : "");
  const [quantity, setQuantity] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  // One key per sale attempt: reused on retry so a sale is never recorded twice.
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const service = services.find((s) => s.id === serviceId);
  const barber = barbers.find((b) => b.id === barberId);
  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && qty >= MIN_QUANTITY && qty <= MAX_QUANTITY;
  const estimate =
    service && barber && qtyValid
      ? calculateSale({ unitPriceCentavos: service.value, quantity: qty, commissionRateBp: barber.value })
      : null;

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!serviceId) next.serviceId = "Choose a service.";
    if (!barberId) next.barberId = "Choose a barber.";
    if (!qtyValid) next.quantity = `Quantity must be a whole number from ${MIN_QUANTITY} to ${MAX_QUANTITY}.`;
    if (!paymentMethod) next.paymentMethod = "Choose how the customer already paid.";
    return next;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const clientErrors = validate();
    setErrors(clientErrors);
    setMessage(null);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, barberId, quantity: qty, paymentMethod, requestKey }),
      });

      if (response.status === 201 || response.status === 200) {
        const { data } = (await response.json()) as { data: { id: string } };
        router.push(`/sales/${data.id}?recorded=1`);
        router.refresh();
        return; // keep the button disabled while navigating
      }

      const body = (await response.json().catch(() => ({}))) as ApiErrorResponse;
      if (response.status === 401) {
        router.push("/login?next=/sales/new");
        return;
      }
      if (response.status === 409) setRequestKey(newRequestKey()); // key belongs to another sale
      setErrors(body.error?.fields ?? {});
      setMessage(body.error?.message ?? "Could not record the sale. Please try again.");
    } catch {
      // Network failure: the same request key is kept, so retrying is safe.
      setMessage("Network error. Check your connection and try again; the sale will not be duplicated.");
    }
    setSubmitting(false);
  }

  const fieldId = (name: string) => `${uid}-${name}`;
  const errorProps = (name: string) =>
    errors[name]
      ? { "aria-invalid": true as const, "aria-describedby": `${fieldId(name)}-error` }
      : {};
  const errorText = (name: string) =>
    errors[name] ? (
      <p id={`${fieldId(name)}-error`} className="text-sm text-destructive">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {message ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("serviceId")}>Service</Label>
          <select
            id={fieldId("serviceId")}
            className={selectClass}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            {...errorProps("serviceId")}
          >
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatPeso(s.value)})
              </option>
            ))}
          </select>
          {errorText("serviceId")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId("barberId")}>Barber</Label>
          <select
            id={fieldId("barberId")}
            className={selectClass}
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            {...errorProps("barberId")}
          >
            <option value="">Choose a barber…</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({formatPercent(b.value)})
              </option>
            ))}
          </select>
          {errorText("barberId")}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId("quantity")}>Quantity</Label>
          <input
            id={fieldId("quantity")}
            type="number"
            inputMode="numeric"
            min={MIN_QUANTITY}
            max={MAX_QUANTITY}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={selectClass}
            {...errorProps("quantity")}
          />
          {errorText("quantity")}
        </div>
      </div>

      <fieldset className="space-y-2" {...(errors.paymentMethod ? { "aria-describedby": `${fieldId("paymentMethod")}-error` } : {})}>
        <legend className="text-sm font-medium">Payment method (already received)</legend>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {PAYMENT_METHODS.map((method) => (
            <label
              key={method}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
                paymentMethod === method ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method}
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
                className="sr-only"
              />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Records how the customer paid. No payment is charged or processed by this app.
        </p>
        {errorText("paymentMethod")}
      </fieldset>

      <div className="rounded-md border bg-muted/40 p-4" aria-live="polite">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimate</p>
        {estimate ? (
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-right text-lg font-semibold tabular-nums">{formatPeso(estimate.grossCentavos)}</dd>
            <dt className="text-muted-foreground">Barber commission ({formatPercent(estimate.commissionRateBp)})</dt>
            <dd className="text-right tabular-nums">{formatPeso(estimate.commissionCentavos)}</dd>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Choose a service, barber and quantity to see the total.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Final amounts are calculated by the server from current prices.</p>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={submitting}>
        {submitting ? "Recording…" : "Record sale"}
      </Button>
    </form>
  );
}
