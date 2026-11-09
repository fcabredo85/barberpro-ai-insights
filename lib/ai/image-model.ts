import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import type { ImageModel } from "ai";

export interface TryOnImageModel {
  model: ImageModel;
  modelId: string;
}

/**
 * Server-only OpenAI image-edit model for the Virtual Try-On Studio, or null
 * when not configured.
 *
 * The model ID is NOT defaulted (PRD §8): image models differ in cost, edit
 * support and account availability, so an operator must set
 * OPENAI_IMAGE_MODEL explicitly after verifying it works for their account.
 * The installed @ai-sdk/openai lists e.g. "gpt-image-2.5-flare" as a known
 * image model, but SDK support does not prove account access.
 */
export function getTryOnImageModel(): TryOnImageModel | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const modelId = process.env.OPENAI_IMAGE_MODEL?.trim();
  if (!apiKey || !modelId) return null;
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = createOpenAI({ apiKey, baseURL });
  return { model: openai.image(modelId), modelId };
}
