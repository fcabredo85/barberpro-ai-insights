import { APICallError, generateImage, NoImageGeneratedError, type ImageModel } from "ai";

import { sniffMediaType, type AcceptedMediaType } from "./image-validation";
import { buildTryOnPrompt } from "./prompt";
import type { Hairstyle } from "./styles";

export type PreviewFailure =
  /** Provider took too long. */
  | "timeout"
  /** Provider declined the request (safety system / content policy). */
  | "refused"
  /** Provider rate limit or quota exhausted on our account. */
  | "provider_rate_limited"
  /** Provider returned nothing usable (no image / unexpected format). */
  | "malformed_response"
  /** Any other provider or network failure. */
  | "upstream_error";

export type GeneratePreviewResult =
  | { kind: "ok"; image: { base64: string; mediaType: string } }
  | { kind: "error"; failure: PreviewFailure };

export interface GeneratePreviewOptions {
  model: ImageModel;
  timeoutMs?: number;
}

/**
 * Media type of the model output, from its actual file signature (the SDK's
 * reported type is a guess), or null if it isn't a supported image.
 */
function sniffBase64Image(base64: string): AcceptedMediaType | null {
  try {
    // 24 base64 chars decode to the first 18 bytes: enough for every signature we accept.
    const head = Uint8Array.from(atob(base64.slice(0, 24)), (c) => c.charCodeAt(0));
    return sniffMediaType(head);
  } catch {
    return null;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /timed? ?out|aborted/i.test(error.message));
}

function isRefusal(error: APICallError): boolean {
  // OpenAI signals safety rejections with 400 + a moderation/safety code. The
  // body is inspected only for classification and never logged or returned.
  const body = (error.responseBody ?? "").toLowerCase();
  return error.statusCode === 400 && /moderation|safety|content[_ ]policy/.test(body);
}

/** Classify any thrown provider error into a safe, user-facing category. */
export function classifyPreviewError(error: unknown): PreviewFailure {
  if (isTimeout(error)) return "timeout";
  if (NoImageGeneratedError.isInstance(error)) return "malformed_response";
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return "provider_rate_limited";
    if (isRefusal(error)) return "refused";
    if (error.statusCode === 408 || error.statusCode === 504) return "timeout";
  }
  return "upstream_error";
}

/**
 * Send the validated, consented photo to the image-edit model. Returns the
 * real model output or a classified error; never a placeholder image.
 */
export async function generateTryOnPreview(
  photo: { bytes: Uint8Array; mediaType: AcceptedMediaType },
  style: Hairstyle,
  { model, timeoutMs = 90_000 }: GeneratePreviewOptions,
): Promise<GeneratePreviewResult> {
  try {
    const { images } = await generateImage({
      model,
      prompt: { images: [photo.bytes], text: buildTryOnPrompt(style) },
      n: 1,
      // No automatic retries: image edits are expensive and a retry may be
      // billed. The user retries explicitly, and each attempt counts toward quota.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    const image = images[0];
    const mediaType = image?.base64 ? sniffBase64Image(image.base64) : null;
    if (!image || !mediaType) return { kind: "error", failure: "malformed_response" };
    return { kind: "ok", image: { base64: image.base64, mediaType } };
  } catch (error) {
    return { kind: "error", failure: classifyPreviewError(error) };
  }
}
