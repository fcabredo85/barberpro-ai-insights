"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Lightbulb, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface InsightView {
  title: string;
  observation: string;
  evidence: string;
  evidenceFacts: Array<{ label: string; value: string }>;
  action: string;
}

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; insights: InsightView[]; generatedAt: string; disclaimer: string }
  | { kind: "insufficient"; message: string }
  | { kind: "error"; message: string; retryAt?: number };

interface AiInsightsPanelProps {
  from: string;
  to: string;
  transactionCount: number;
  minTransactions: number;
}

const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

export function AiInsightsPanel({ from, to, transactionCount, minTransactions }: AiInsightsPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const enoughData = transactionCount >= minTransactions;

  // Tick only while a rate-limit countdown is showing.
  const retryAt = state.kind === "error" ? state.retryAt : undefined;
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const waitSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  async function generate() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json().catch(() => null);

      if (res.ok && body?.data?.status === "ok") {
        setState({ kind: "ok", insights: body.data.insights, generatedAt: body.data.generatedAt, disclaimer: body.data.disclaimer });
      } else if (res.ok && body?.data?.status === "insufficient_data") {
        setState({ kind: "insufficient", message: body.data.message });
      } else if (res.status === 429) {
        const seconds = Number(res.headers.get("Retry-After")) || 60;
        setNow(Date.now());
        setState({ kind: "error", message: body?.error?.message ?? "Too many requests.", retryAt: Date.now() + seconds * 1000 });
      } else {
        setState({ kind: "error", message: body?.error?.message ?? "Couldn't generate insights. Please try again." });
      }
    } catch {
      setState({ kind: "error", message: "Network error. Check your connection and try again." });
    }
  }

  if (!enoughData && state.kind === "idle") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          AI insights need at least {minTransactions} recorded sales in the selected period. This period has{" "}
          {transactionCount}. Record more sales or choose a longer range.
        </p>
        <Button variant="outline" size="sm" disabled>
          <Sparkles />
          Generate insights
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-busy={state.kind === "loading"}>
      <p aria-live="polite" className="sr-only">
        {state.kind === "loading" ? "Analyzing your sales…" : state.kind === "ok" ? "Three insights ready." : ""}
      </p>

      {state.kind === "idle" ? (
        <div className="space-y-3 text-sm">
          <p className="max-w-prose text-muted-foreground">
            Get three suggestions based on {transactionCount} recorded sales in this period. Only totals are shared with
            the AI, never customer details or barber names.
          </p>
          <Button onClick={generate} size="sm">
            <Sparkles />
            Generate insights
          </Button>
        </div>
      ) : null}

      {state.kind === "loading" ? (
        <ol className="grid gap-3 lg:grid-cols-3" aria-label="Loading insights">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 rounded-lg border p-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ol>
      ) : null}

      {state.kind === "ok" ? (
        <>
          <ol className="grid gap-3 lg:grid-cols-3">
            {state.insights.map((insight, i) => (
              <li key={insight.title} className="flex flex-col gap-2 rounded-lg border p-3">
                <h3 className="flex items-start gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                  {insight.title}
                </h3>
                <p className="text-sm">{insight.observation}</p>
                <dl className="flex flex-wrap gap-1.5" aria-label="Evidence from your sales">
                  {insight.evidenceFacts.map((fact) => (
                    <div key={fact.label} className="rounded-md bg-muted px-2 py-1 text-xs">
                      <dt className="inline text-muted-foreground">{fact.label}: </dt>
                      <dd className="inline font-semibold">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-auto flex gap-2 rounded-md border-l-2 border-primary bg-muted/40 px-2 py-1.5 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">Try: </span>
                    {insight.action}
                  </span>
                </p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              AI suggestion · generated {timeFormat.format(new Date(state.generatedAt))}. {state.disclaimer}
            </span>
            <Button variant="ghost" size="sm" onClick={generate}>
              <RefreshCw />
              Regenerate
            </Button>
          </div>
        </>
      ) : null}

      {state.kind === "insufficient" ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" onClick={() => setState({ kind: "idle" })}>
            OK
          </Button>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            {state.message}
          </p>
          <Button variant="outline" size="sm" onClick={generate} disabled={waitSeconds > 0}>
            <RefreshCw />
            {waitSeconds > 0 ? `Try again in ${waitSeconds}s` : "Try again"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
