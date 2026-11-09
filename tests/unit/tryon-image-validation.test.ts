import { describe, expect, it } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  checkFileBasics,
  normalizeMediaType,
  sniffMediaType,
  validateImageBytes,
} from "@/lib/tryon/image-validation";

import { makeJpeg, makePng, makeWebp } from "./tryon-test-helpers";

describe("validateImageBytes: accepted photos (FR-03)", () => {
  it.each([
    ["JPEG", makeJpeg(1080, 1350), "image/jpeg"],
    ["JPEG declared as image/jpg", makeJpeg(1080, 1350), "image/jpg"],
    ["PNG", makePng(800, 800), "image/png"],
    ["WebP (VP8X)", makeWebp(1200, 1600), "image/webp"],
    ["a file with no declared type", makePng(800, 800), ""],
  ])("accepts %s", (_label, bytes, type) => {
    const result = validateImageBytes(bytes, type);
    expect(result.ok).toBe(true);
  });

  it("reports parsed dimensions", () => {
    expect(validateImageBytes(makeJpeg(1080, 1350), "image/jpeg")).toEqual({
      ok: true,
      mediaType: "image/jpeg",
      width: 1080,
      height: 1350,
    });
    expect(validateImageBytes(makeWebp(1200, 1600), "image/webp")).toMatchObject({ width: 1200, height: 1600 });
  });
});

describe("validateImageBytes: rejected uploads (FR-03, FR-04)", () => {
  it("rejects an empty file", () => {
    expect(validateImageBytes(new Uint8Array(), "image/jpeg")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects files over 8 MB", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(makeJpeg(1000, 1000));
    expect(validateImageBytes(big, "image/jpeg")).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("accepts exactly 8 MB", () => {
    expect(checkFileBasics(MAX_UPLOAD_BYTES, "image/png")).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/html"])("rejects declared type %s", (type) => {
    expect(validateImageBytes(makePng(800, 800), type)).toMatchObject({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a PNG disguised as a JPEG (signature mismatch)", () => {
    expect(validateImageBytes(makePng(800, 800), "image/jpeg")).toMatchObject({ ok: false, reason: "type_mismatch" });
  });

  it("rejects non-image content with an image MIME type", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(400, " "));
    expect(validateImageBytes(html, "image/png")).toMatchObject({ ok: false, reason: "type_mismatch" });
  });

  it("rejects a GIF even without a declared type", () => {
    const gif = new TextEncoder().encode("GIF89a".padEnd(400, "\0"));
    expect(validateImageBytes(gif, "")).toMatchObject({ ok: false, reason: "unsupported_type" });
  });

  it.each([
    ["truncated PNG (no IEND)", makePng(800, 800, { truncated: true }), "image/png"],
    ["truncated JPEG (no EOI)", makeJpeg(800, 800, { truncated: true }), "image/jpeg"],
    ["JPEG signature with garbage", new Uint8Array([0xff, 0xd8, 0xff, 0x00, 1, 2, 3, 4, 5, 6]), "image/jpeg"],
    ["WebP with an overstated RIFF size", makeWebp(800, 800).slice(0, 28), "image/webp"],
  ])("rejects a corrupt file: %s", (_label, bytes, type) => {
    expect(validateImageBytes(bytes, type)).toMatchObject({ ok: false, reason: "corrupt" });
  });

  it("rejects zero-sized dimensions", () => {
    expect(validateImageBytes(makePng(0, 800), "image/png")).toMatchObject({ ok: false, reason: "corrupt" });
  });

  it("rejects animated images", () => {
    expect(validateImageBytes(makePng(800, 800, { animated: true }), "image/png")).toMatchObject({ reason: "animated" });
    expect(validateImageBytes(makeWebp(800, 800, { animated: true }), "image/webp")).toMatchObject({ reason: "animated" });
  });

  it("rejects photos that are too small", () => {
    expect(validateImageBytes(makeJpeg(200, 900), "image/jpeg")).toMatchObject({ ok: false, reason: "too_small" });
  });

  it("rejects excessive pixel dimensions (decompression-bomb style headers)", () => {
    expect(validateImageBytes(makePng(9000, 1000), "image/png")).toMatchObject({ ok: false, reason: "too_many_pixels" });
    expect(validateImageBytes(makePng(8000, 8000), "image/png")).toMatchObject({ ok: false, reason: "too_many_pixels" });
    expect(validateImageBytes(makePng(60000, 60000), "image/png")).toMatchObject({ ok: false, reason: "too_many_pixels" });
  });

  it("gives every rejection a readable message", () => {
    const result = validateImageBytes(makePng(800, 800), "image/jpeg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/JPG, PNG or WebP/);
  });
});

describe("helpers", () => {
  it("sniffs signatures independent of declared type", () => {
    expect(sniffMediaType(makeJpeg(500, 500))).toBe("image/jpeg");
    expect(sniffMediaType(makePng(500, 500))).toBe("image/png");
    expect(sniffMediaType(makeWebp(500, 500))).toBe("image/webp");
    expect(sniffMediaType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("normalizes MIME aliases and parameters", () => {
    expect(normalizeMediaType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    expect(normalizeMediaType("image/pjpeg")).toBe("image/jpeg");
    expect(normalizeMediaType("image/heic")).toBeNull();
  });
});
