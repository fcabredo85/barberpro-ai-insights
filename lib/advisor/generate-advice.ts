import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";

import { ADVISOR_SYSTEM_PROMPT, buildAdvisorPrompt } from "./prompt";
import { adviceModelOutputSchema, validateAdvice, type Advice, type AdvicePreferences } from "./schema";

export type GenerateAdviceResult =
  | { kind: "ok"; advice: Advice }
  | { kind: "invalid_output"; problems: string[] }
  | { kind: "upstream_error" }
  | { kind: "timeout" };

export interface GenerateAdviceOptions {
  model: LanguageModel;
  timeoutMs?: number;
  validationRetries?: number;
}

/** Ask for 3-5 catalog recommendations and validate them strictly. */
export async function generateAdvice(
  preferences: AdvicePreferences,
  { model, timeoutMs = 25_000, validationRetries = 1 }: GenerateAdviceOptions,
): Promise<GenerateAdviceResult> {
  const prompt = buildAdvisorPrompt(preferences);
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt <= validationRetries; attempt++) {
    let raw: unknown;
    try {
      const result = await generateText({
        model,
        system: ADVISOR_SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: adviceModelOutputSchema }),
        maxRetries: 1,
        timeout: timeoutMs,
        providerOptions: { openai: { store: false } },
      });
      raw = result.output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastProblems = ["output: response was not valid JSON for the advice schema"];
        continue;
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /timeout|aborted/i.test(error.message))) {
        return { kind: "timeout" };
      }
      return { kind: "upstream_error" };
    }

    const validated = validateAdvice(raw);
    if (validated.ok) return { kind: "ok", advice: validated.advice };
    lastProblems = validated.problems;
  }

  return { kind: "invalid_output", problems: lastProblems };
}
