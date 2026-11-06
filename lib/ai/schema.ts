import { z } from "zod";

import type { InsightContext } from "./facts";

export const INSIGHT_COUNT = 3;

/**
 * Shape requested from the model. Kept simple (no length constraints) so it
 * works with provider structured-output modes; the strict rules are enforced
 * afterwards by validateInsights().
 */
export const modelOutputSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string().describe("Short headline, 3-8 words."),
      observation: z.string().describe("What the data shows, citing only provided facts."),
      evidenceFactIds: z.array(z.string()).describe("1-4 ids from the provided facts that support the observation."),
      action: z.string().describe("One practical, low-risk next step for the owner."),
    }),
  ),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** A validated insight as returned to the client. */
export interface Insight {
  title: string;
  observation: string;
  /** Human-readable numeric evidence, rendered by the server from facts. */
  evidence: string;
  evidenceFacts: Array<{ label: string; value: string }>;
  action: string;
}

const strictInsightSchema = z.object({
  title: z.string().trim().min(3).max(80),
  observation: z.string().trim().min(20).max(400),
  evidenceFactIds: z.array(z.string()).min(1).max(4),
  action: z.string().trim().min(20).max(400),
});

const strictOutputSchema = z.object({
  insights: z.array(strictInsightSchema).length(INSIGHT_COUNT),
});

/** Certainty and financial-promise language the app never presents as fact. */
const FORBIDDEN_PHRASES = [
  /\bguarantee[sd]?\b/i,
  /\bwill (definitely|certainly|surely)\b/i,
  /\b100% (sure|certain)\b/i,
  /\brisk[- ]free\b/i,
  /\bno risk\b/i,
];

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";

/** Numbers that are part of names, dates or aliases rather than claims. */
function stripNonClaimNumbers(text: string, labels: readonly string[]): string {
  let out = text;
  for (const label of labels) out = out.split(label).join(" ");
  return out
    .replace(/\bBarber \d+\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(new RegExp(`\\b${MONTHS} \\d{1,2}(?:, \\d{4})?\\b`, "gi"), " ")
    .replace(new RegExp(`\\b\\d{1,2} ${MONTHS}(?: \\d{4})?\\b`, "gi"), " ");
}

/** Extract numeric claims ("₱1,549.96", "38.8%", "4") as numbers. */
export function extractNumbers(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((token) => Number(token.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/** Small counts and ordinals ("top 2", "3 insights") are allowed without a fact. */
const SMALL_INTEGER_LIMIT = 10;

export type ValidationResult =
  | { ok: true; insights: Insight[] }
  | { ok: false; problems: string[] };

/**
 * Enforce the insight contract on raw model output. Rejects (never repairs):
 * wrong count, missing/overlong text, unknown fact ids, numbers not present in
 * the fact sheet, certainty/guarantee language, links and email addresses.
 */
export function validateInsights(raw: unknown, ctx: InsightContext): ValidationResult {
  const parsed = strictOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "output"}: ${i.message}`) };
  }

  const allowedNumbers = ctx.facts.flatMap((f) => f.numbers);
  const isAllowed = (n: number) =>
    (Number.isInteger(n) && n >= 0 && n <= SMALL_INTEGER_LIMIT) || allowedNumbers.some((a) => Math.abs(a - n) < 0.005);
  // Service names may legitimately contain digits ("2-in-1 Cut"); strip them before checking.
  const nameLabels = [...ctx.facts.map((f) => f.modelLabel.split(":")[0]!.trim())].filter((l) => /\d/.test(l) && !/^Barber \d+$/.test(l));

  const problems: string[] = [];
  const titles = new Set<string>();

  parsed.data.insights.forEach((insight, i) => {
    const where = `insights.${i}`;
    if (titles.has(insight.title.toLowerCase())) problems.push(`${where}: duplicate insight`);
    titles.add(insight.title.toLowerCase());

    const ids = new Set(insight.evidenceFactIds);
    if (ids.size !== insight.evidenceFactIds.length) problems.push(`${where}: repeated evidence id`);
    for (const id of ids) if (!ctx.factsById.has(id)) problems.push(`${where}: unknown evidence id "${id}"`);

    for (const [field, text] of [
      ["title", insight.title],
      ["observation", insight.observation],
      ["action", insight.action],
    ] as const) {
      for (const n of extractNumbers(stripNonClaimNumbers(text, nameLabels))) {
        if (!isAllowed(n)) problems.push(`${where}.${field}: unsupported number ${n}`);
      }
      if (FORBIDDEN_PHRASES.some((re) => re.test(text))) problems.push(`${where}.${field}: certainty or guarantee language`);
      if (/https?:\/\/|www\./i.test(text)) problems.push(`${where}.${field}: contains a link`);
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) problems.push(`${where}.${field}: contains an email address`);
    }
  });

  if (problems.length > 0) return { ok: false, problems };

  const restore = (text: string) => text.replace(/\bBarber (\d+)\b/g, (alias) => ctx.aliases.get(alias) ?? alias);

  return {
    ok: true,
    insights: parsed.data.insights.map((insight) => {
      const evidenceFacts = insight.evidenceFactIds.map((id) => {
        const fact = ctx.factsById.get(id)!;
        return { label: fact.displayLabel, value: fact.value };
      });
      return {
        title: restore(insight.title),
        observation: restore(insight.observation),
        evidence: evidenceFacts.map((f) => `${f.label}: ${f.value}`).join("; "),
        evidenceFacts,
        action: restore(insight.action),
      };
    }),
  };
}
