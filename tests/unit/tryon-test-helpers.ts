import { MockImageModelV4 } from "ai/test";

/** Minimal, structurally valid image files for validation tests (no pixel data needed). */

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function makePng(width: number, height: number, { animated = false, truncated = false } = {}): Uint8Array {
  const ihdr = [...be32(13), ...text("IHDR"), ...be32(width), ...be32(height), 8, 2, 0, 0, 0, 0, 0, 0, 0];
  const actl = animated ? [...be32(8), ...text("acTL"), ...be32(2), ...be32(0), 0, 0, 0, 0] : [];
  const idat = [...be32(2), ...text("IDAT"), 0x78, 0x9c, 0, 0, 0, 0];
  const iend = [0, 0, 0, 0, ...text("IEND"), 0xae, 0x42, 0x60, 0x82];
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...actl, ...idat, ...iend];
  return new Uint8Array(truncated ? bytes.slice(0, bytes.length - 12) : bytes);
}

export function makeJpeg(width: number, height: number, { truncated = false } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, ...be16(16), ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof0 = [0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0, 0x12, 0x34, 0x56];
  const bytes = [0xff, 0xd8, ...app0, ...sof0, ...sos, ...(truncated ? [] : [0xff, 0xd9])];
  return new Uint8Array(bytes);
}

export function makeWebp(width: number, height: number, { animated = false } = {}): Uint8Array {
  const vp8x = [...text("VP8X"), ...le32(10), animated ? 0x02 : 0x00, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)];
  const body = [...text("WEBP"), ...vp8x];
  return new Uint8Array([...text("RIFF"), ...le32(body.length), ...body]);
}

/** A 1x1 PNG, base64: what the mock image model "returns". */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export type ImageReply = string | Error | { images: string[] };

/** Mock image model that returns the given base64 images or throws. Records calls. */
export function mockImageModel(reply: ImageReply = TINY_PNG_BASE64) {
  const calls: Array<{ prompt: string | undefined; fileCount: number }> = [];
  const model = new MockImageModelV4({
    modelId: "mock-image-model",
    doGenerate: async (options) => {
      calls.push({ prompt: options.prompt, fileCount: options.files?.length ?? 0 });
      if (reply instanceof Error) throw reply;
      const images = typeof reply === "string" ? [reply] : reply.images;
      return { images, warnings: [], response: { timestamp: new Date(), modelId: "mock-image-model", headers: undefined } };
    },
  });
  return { model, calls };
}

/** A valid advisor model response for preferences short / low / straight / sporty. */
export function validAdvice() {
  return {
    recommendations: [
      { styleId: "buzz-cut", reason: "You asked for a short, low-maintenance and sporty look, and a buzz cut needs almost no styling." },
      { styleId: "crew-cut", reason: "A crew cut keeps the top short with a neat finish and suits a low daily styling effort." },
      { styleId: "textured-crop", reason: "A textured crop stays short on top and works with straight hair using a little matte product." },
    ],
    caveat: "Results vary from person to person, so your barber will confirm the best option in person.",
  };
}
