"use client";

import { ShieldCheck } from "lucide-react";

import { PHOTO_CONSENT_NOTICE } from "@/lib/tryon/consent";

interface ConsentPanelProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Explicit, unchecked-by-default consent for sending the photo to the AI
 * provider (FR-05). The parent resets it whenever the photo changes.
 */
export function ConsentPanel({ checked, onChange, disabled }: ConsentPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        {PHOTO_CONSENT_NOTICE.heading}
      </p>
      <ul id="photo-consent-notice" className="list-disc space-y-1 pl-5 text-muted-foreground">
        {PHOTO_CONSENT_NOTICE.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-background p-2.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="photo-consent-notice"
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span>{PHOTO_CONSENT_NOTICE.checkboxLabel}</span>
      </label>
    </div>
  );
}
