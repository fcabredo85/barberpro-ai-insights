import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";

import type { SalesReport } from "@/lib/business/metrics";
import { buildInsightContext } from "./facts";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { modelOutputSchema, validateInsights, type Insight } from "./schema";

export type GenerateInsightsResult =
  | { kind: "ok"; insights: Insight[] }
  | { kind: "invalid_output"; problems: string[] }
  | { kind: "upstream_error" }
  | { kind: "timeout" };

export interface GenerateInsightsOptions {
  model: LanguageModel;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts when the model returns output that fails validation. */
  validationRetries?: number;
}

/**
 * Ask the model for exactly three grounded insights about the report. The
 * model sees only the aggregate fact sheet; it has no tools and no database
 * access, so it cannot read other data or change any record.
 */
export async function generateInsights(
  report: SalesReport,
  { model, timeoutMs = 25_000, validationRetries = 1 }: GenerateInsightsOptions,
): Promise<GenerateInsightsResult> {
  const ctx = buildInsightContext(report);
  const prompt = buildUserPrompt(ctx);
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt <= validationRetries; attempt++) {
    let raw: unknown;
    try {
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: modelOutputSchema }),
        maxRetries: 1, // transport-level retry for transient provider errors
        timeout: timeoutMs,
        // Ask OpenAI not to store the request (no retention of shop data for later use).
        providerOptions: { openai: { store: false } },
      });
      raw = result.output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastProblems = ["output: response was not valid JSON for the insight schema"];
        continue;
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /timeout|aborted/i.test(error.message))) {
        return { kind: "timeout" };
      }
      return { kind: "upstream_error" };
    }

    const validated = validateInsights(raw, ctx);
    if (validated.ok) return { kind: "ok", insights: validated.insights };
    lastProblems = validated.problems;
  }

  return { kind: "invalid_output", problems: lastProblems };
}
