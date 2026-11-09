// @vitest-environment node
import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import { classifyPreviewError, generateTryOnPreview } from "@/lib/tryon/generate-preview";
import { getHairstyle } from "@/lib/tryon/styles";

import { TINY_PNG_BASE64, makeJpeg, mockImageModel } from "./tryon-test-helpers";

const photo = { bytes: makeJpeg(1024, 1024), mediaType: "image/jpeg" as const };
const style = getHairstyle("low-taper-fade");

function apiError(statusCode: number, responseBody = "") {
  return new APICallError({
    message: `status ${statusCode}`,
    url: "https://api.openai.com/v1/images/edits",
    requestBodyValues: {},
    statusCode,
    responseBody,
    isRetryable: false,
  });
}

describe("generateTryOnPreview (FR-07)", () => {
  it("sends the photo as an edit input with the style prompt and returns the real output", async () => {
    const { model, calls } = mockImageModel();
    const result = await generateTryOnPreview(photo, style, { model });
    expect(result).toEqual({ kind: "ok", image: { base64: TINY_PNG_BASE64, mediaType: "image/png" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fileCount).toBe(1);
    expect(calls[0]!.prompt).toContain("Low Taper Fade");
  });

  it("treats an empty image list as malformed, never a placeholder", async () => {
    const { model } = mockImageModel({ images: [] });
    expect(await generateTryOnPreview(photo, style, { model })).toEqual({ kind: "error", failure: "malformed_response" });
  });

  it("treats non-image output as malformed", async () => {
    const { model } = mockImageModel(Buffer.from("not an image at all").toString("base64"));
    expect(await generateTryOnPreview(photo, style, { model })).toEqual({ kind: "error", failure: "malformed_response" });
  });

  it("reports a timeout when the provider is too slow", async () => {
    const { MockImageModelV4 } = await import("ai/test");
    const slow = new MockImageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason));
        }),
    });
    const result = await generateTryOnPreview(photo, style, { model: slow, timeoutMs: 20 });
    expect(result).toEqual({ kind: "error", failure: "timeout" });
  });

  it("classifies provider failures", async () => {
    for (const [error, failure] of [
      [apiError(400, '{"error":{"code":"moderation_blocked","message":"safety system"}}'), "refused"],
      [apiError(429), "provider_rate_limited"],
      [apiError(500), "upstream_error"],
      [apiError(400, '{"error":{"code":"invalid_request"}}'), "upstream_error"],
    ] as const) {
      const { model } = mockImageModel(error);
      expect(await generateTryOnPreview(photo, style, { model })).toEqual({ kind: "error", failure });
    }
  });

  it("classifies unknown errors as upstream errors", () => {
    expect(classifyPreviewError(new Error("socket hang up"))).toBe("upstream_error");
    expect(classifyPreviewError("weird")).toBe("upstream_error");
  });
});
