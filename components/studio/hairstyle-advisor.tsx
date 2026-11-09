"use client";

import { useRef, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LENGTH_OPTIONS,
  MAINTENANCE_OPTIONS,
  TEXTURE_OPTIONS,
  VIBE_OPTIONS,
  type AdvicePreferences,
} from "@/lib/advisor/schema";
import type { HairstyleId } from "@/lib/tryon/styles";

interface RecommendationView {
  styleId: HairstyleId;
  styleName: string;
  reason: string;
}

type AdvisorState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; recommendations: RecommendationView[]; caveat: string; disclaimer: string }
  | { kind: "error"; message: string };

interface HairstyleAdvisorProps {
  onTryStyle: (id: HairstyleId) => void;
  onRecommendations: (ids: HairstyleId[]) => void;
  disabled?: boolean;
}

const LABELS: Record<string, string> = {
  short: "Short",
  medium: "Medium",
  long: "Longer",
  no_preference: "No preference",
  low: "Low",
  high: "High",
  straight: "Straight",
  wavy: "Wavy",
  curly: "Curly",
  coily: "Coily",
  not_sure: "Not sure",
  classic: "Classic",
  modern: "Modern",
  professional: "Professional",
  sporty: "Sporty",
  bold: "Bold",
};

const QUESTIONS = [
  { key: "lengthOnTop", legend: "Length on top", options: LENGTH_OPTIONS },
  { key: "maintenance", legend: "Daily styling effort", options: MAINTENANCE_OPTIONS },
  { key: "hairTexture", legend: "Your hair texture", options: TEXTURE_OPTIONS },
  { key: "vibe", legend: "Look you're going for", options: VIBE_OPTIONS },
] as const;

const DEFAULT_PREFERENCES: AdvicePreferences = {
  lengthOnTop: "no_preference",
  maintenance: "medium",
  hairTexture: "not_sure",
  vibe: "no_preference",
};

/**
 * AI Hairstyle Advisor (FR-19): preference questions -> 3-5 catalog picks.
 * Works without a photo; nothing about the person's appearance is inferred.
 */
export function HairstyleAdvisor({ onTryStyle, onRecommendations, disabled }: HairstyleAdvisorProps) {
  const [prefs, setPrefs] = useState<AdvicePreferences>(DEFAULT_PREFERENCES);
  const [state, setState] = useState<AdvisorState>({ kind: "idle" });
  const inFlight = useRef(false);

  async function ask() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/hairstyle-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs, requestKey: crypto.randomUUID() }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data?.status === "ok") {
        const recommendations = body.data.recommendations as RecommendationView[];
        setState({ kind: "ok", recommendations, caveat: body.data.caveat, disclaimer: body.data.disclaimer });
        onRecommendations(recommendations.map((r) => r.styleId));
      } else {
        setState({ kind: "error", message: body?.error?.message ?? "Couldn't get advice. Please try again." });
      }
    } catch {
      setState({ kind: "error", message: "Network error. Check your connection and try again." });
    } finally {
      inFlight.current = false;
    }
  }

  const loading = state.kind === "loading";

  return (
    <div className="space-y-4" aria-busy={loading}>
      <div className="grid gap-4 sm:grid-cols-2">
        {QUESTIONS.map((q) => (
          <fieldset key={q.key} disabled={disabled || loading} className="min-w-0 space-y-1.5">
            <legend className="text-sm font-medium">{q.legend}</legend>
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((option) => {
                const checked = prefs[q.key] === option;
                return (
                  <label
                    key={option}
                    className={
                      "cursor-pointer rounded-md border px-2.5 py-1 text-sm focus-within:ring-2 focus-within:ring-ring " +
                      (checked ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")
                    }
                  >
                    <input
                      type="radio"
                      name={`advisor-${q.key}`}
                      value={option}
                      checked={checked}
                      onChange={() => setPrefs((p) => ({ ...p, [q.key]: option }))}
                      className="sr-only"
                    />
                    {LABELS[option]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={ask} disabled={disabled || loading}>
        <Sparkles />
        {loading ? "Finding styles…" : "Suggest styles for me"}
      </Button>

      <p aria-live="polite" className="sr-only">
        {loading ? "Finding hairstyle suggestions…" : state.kind === "ok" ? `${state.recommendations.length} suggestions ready.` : ""}
      </p>

      {state.kind === "ok" ? (
        <div className="space-y-2">
          <ol className="space-y-2">
            {state.recommendations.map((rec, i) => (
              <li key={rec.styleId} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {i + 1}. {rec.styleName}
                  </p>
                  <p className="text-muted-foreground">{rec.reason}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onTryStyle(rec.styleId)} disabled={disabled}>
                  Choose this style
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            AI suggestion. {state.caveat} {state.disclaimer}
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
