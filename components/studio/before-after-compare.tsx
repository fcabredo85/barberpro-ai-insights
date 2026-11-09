"use client";

import { useId, useState } from "react";

import { SIMULATION_LABEL } from "@/lib/tryon/consent";
import { cn } from "@/lib/utils";

type ViewMode = "compare" | "original" | "preview";

interface BeforeAfterCompareProps {
  originalUrl: string;
  previewUrl: string;
  styleName: string;
  /** Original photo's width / height; both layers are framed to it so they align. */
  aspectRatio: number;
}

const MODES: Array<{ key: ViewMode; label: string }> = [
  { key: "compare", label: "Compare" },
  { key: "original", label: "Original" },
  { key: "preview", label: "AI preview" },
];

/**
 * Before/after comparison (FR-10). The divider is a native range input, so it
 * works with mouse, touch and keyboard (arrows, Home/End, Page Up/Down) and is
 * announced by screen readers. Separate Original / AI preview views provide
 * an alternative to dragging.
 */
export function BeforeAfterCompare({ originalUrl, previewUrl, styleName, aspectRatio }: BeforeAfterCompareProps) {
  const [mode, setMode] = useState<ViewMode>("compare");
  const [position, setPosition] = useState(50);
  const sliderId = useId();

  const originalAlt = "Original photo, before the AI hairstyle edit";
  const previewAlt = `${SIMULATION_LABEL}: the same photo edited to show a ${styleName}`;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Comparison view" className="inline-flex rounded-md border p-0.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === m.key ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <figure className="space-y-2">
        <div
          className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border bg-muted"
          style={{ aspectRatio: String(aspectRatio) }}
        >
          {mode === "original" ? (
            /* eslint-disable-next-line @next/next/no-img-element -- local blob: URL */
            <img src={originalUrl} alt={originalAlt} className="absolute inset-0 h-full w-full object-cover" />
          ) : mode === "preview" ? (
            /* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URL */
            <img src={previewUrl} alt={previewAlt} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              {/* Preview underneath; original on top, clipped to the slider position. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data: URL */}
              <img src={previewUrl} alt={previewAlt} className="absolute inset-0 h-full w-full object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL */}
              <img
                src={originalUrl}
                alt={originalAlt}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow"
                style={{ left: `${position}%` }}
              />
              <span aria-hidden="true" className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                Before
              </span>
            </>
          )}
          {mode !== "original" ? (
            <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {SIMULATION_LABEL}
            </span>
          ) : null}
        </div>

        {mode === "compare" ? (
          <div className="mx-auto max-w-md space-y-1">
            <label htmlFor={sliderId} className="text-sm font-medium">
              Before / after divider
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              aria-valuetext={`${position}% original, ${100 - position}% AI preview`}
              className="w-full accent-primary"
            />
          </div>
        ) : null}

        <figcaption className="text-center text-xs text-muted-foreground">
          Left: your original photo. Right: {SIMULATION_LABEL.toLowerCase()} of a {styleName}.
        </figcaption>
      </figure>
    </div>
  );
}
