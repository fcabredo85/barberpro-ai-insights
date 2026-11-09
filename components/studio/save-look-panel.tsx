"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Bookmark, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOOK_STORAGE_NOTICE, LOOK_STORAGE_NOTICE_VERSION } from "@/lib/tryon/consent";

interface SaveLookPanelProps {
  tryOnJobId: string;
  original: Blob;
  previewDataUrl: string;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; lookId: string } | { kind: "error"; message: string; fields?: Record<string, string> };

/** Decode a data: URL without fetch(), so it works the same in every browser. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/**
 * Save Look (FR-13): staff enter the customer's name and record a SEPARATE,
 * unchecked-by-default consent to store the photos. Success is shown only
 * after the server confirms the look was saved.
 */
export function SaveLookPanel({ tryOnJobId, original, previewDataUrl }: SaveLookPanelProps) {
  const [customerLabel, setCustomerLabel] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const inFlight = useRef(false);
  const id = useId();

  async function save(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !consent || !customerLabel.trim()) return;
    inFlight.current = true;
    setState({ kind: "saving" });

    const form = new FormData();
    form.set("original", original, "original.jpg");
    form.set("preview", dataUrlToBlob(previewDataUrl), "preview");
    form.set("tryOnJobId", tryOnJobId);
    form.set("customerLabel", customerLabel.trim());
    if (title.trim()) form.set("title", title.trim());
    form.set("storageConsent", "granted");
    form.set("storageNoticeVersion", LOOK_STORAGE_NOTICE_VERSION);

    try {
      const res = await fetch("/api/looks", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && typeof body?.data?.lookId === "string") {
        setState({ kind: "saved", lookId: body.data.lookId });
      } else {
        setState({ kind: "error", message: body?.error?.message ?? "Couldn't save the look. Please try again.", fields: body?.error?.fields });
      }
    } catch {
      setState({ kind: "error", message: "Network error. Check your connection and try again." });
    } finally {
      inFlight.current = false;
    }
  }

  if (state.kind === "saved") {
    return (
      <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        Look saved for {customerLabel.trim()}.
        <Link href="/studio/looks" className="font-medium underline underline-offset-4">
          View saved looks
        </Link>
        <Link href={`/appointments/new?lookId=${state.lookId}`} className="font-medium underline underline-offset-4">
          Book this style
        </Link>
      </p>
    );
  }

  const saving = state.kind === "saving";
  const fieldError = state.kind === "error" ? state.fields : undefined;

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border p-3 text-sm" aria-busy={saving}>
      <p className="flex items-center gap-2 font-medium">
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        {LOOK_STORAGE_NOTICE.heading}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-customer`}>Customer name</Label>
          <Input
            id={`${id}-customer`}
            value={customerLabel}
            onChange={(e) => setCustomerLabel(e.target.value)}
            maxLength={100}
            required
            autoComplete="off"
            aria-invalid={fieldError?.customerLabel ? true : undefined}
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-title`}>Note (optional)</Label>
          <Input
            id={`${id}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="e.g. For next Saturday"
            autoComplete="off"
            disabled={saving}
          />
        </div>
      </div>
      <ul id={`${id}-notice`} className="list-disc space-y-1 pl-5 text-muted-foreground">
        {LOOK_STORAGE_NOTICE.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-background p-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-describedby={`${id}-notice`}
          disabled={saving}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span>{LOOK_STORAGE_NOTICE.checkboxLabel}</span>
      </label>
      {state.kind === "error" ? (
        <p role="alert" className="flex gap-2 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={saving || !consent || !customerLabel.trim()}>
        {saving ? <Loader2 className="animate-spin" /> : <Bookmark />}
        {saving ? "Saving…" : "Save Look"}
      </Button>
    </form>
  );
}
