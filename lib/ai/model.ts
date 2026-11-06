import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const DEFAULT_INSIGHTS_MODEL = "gpt-5.4-mini";

export interface InsightsModel {
  model: LanguageModel;
  modelId: string;
}

/**
 * Server-only OpenAI model for insights, or null when no API key is
 * configured. The key is read from the server environment and never sent to
 * the browser or logged.
 */
export function getInsightsModel(): InsightsModel | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const modelId = process.env.OPENAI_MODEL?.trim() || DEFAULT_INSIGHTS_MODEL;
  // Optional: an OpenAI-compatible gateway or proxy (also used by local end-to-end tests).
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = createOpenAI({ apiKey, baseURL });
  return { model: openai.responses(modelId), modelId };
}
