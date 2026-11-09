"use client";

import { Check } from "lucide-react";

import { HAIRSTYLES, type HairstyleId } from "@/lib/tryon/styles";
import { cn } from "@/lib/utils";

interface StylePickerProps {
  value: HairstyleId;
  onChange: (id: HairstyleId) => void;
  disabled?: boolean;
  /** Styles the advisor suggested, shown with a badge. */
  suggested?: ReadonlySet<HairstyleId>;
}

const MAINTENANCE_LABEL = { low: "Low upkeep", medium: "Medium upkeep", high: "High upkeep" } as const;

/**
 * Hairstyle tiles as a native radio group: arrow keys move between styles,
 * Space selects, and screen readers announce name + description (FR-06).
 */
export function StylePicker({ value, onChange, disabled, suggested }: StylePickerProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">Hairstyle</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {HAIRSTYLES.map((style) => {
          const selected = style.id === value;
          const nameId = `style-${style.id}-name`;
          const descriptionId = `style-${style.id}-description`;
          return (
            <label
              key={style.id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm transition-colors",
                "focus-within:ring-2 focus-within:ring-ring hover:bg-accent/50",
                selected && "border-primary ring-1 ring-primary",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="hairstyle"
                value={style.id}
                checked={selected}
                onChange={() => onChange(style.id)}
                aria-labelledby={nameId}
                aria-describedby={descriptionId}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-2">
                <span id={nameId} className="font-semibold">
                  {style.name}
                </span>
                {selected ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Selected
                  </span>
                ) : null}
              </span>
              <span id={descriptionId} className="text-muted-foreground">
                {style.description}
              </span>
              <span className="mt-auto flex flex-wrap gap-1.5 pt-1 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5">{MAINTENANCE_LABEL[style.maintenance]}</span>
                {suggested?.has(style.id) ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">Advisor pick</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
