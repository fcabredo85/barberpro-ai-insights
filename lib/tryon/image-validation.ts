/**
 * Selfie upload validation (PRD FR-03, FR-04). Pure and dependency-free so the
 * same rules run in the browser (instant feedback) and on the server (the
 * actual security boundary).
 *
 * The server never trusts the declared MIME type or file name: it sniffs the
 * file signature, requires it to match the declared type, parses dimensions
 * from the image header, and rejects truncated or structurally invalid files.
 *
 * Limitation: this does not fully decode pixel data (that would need a native
 * image library). Structurally valid but internally corrupt images are caught
 * by the provider, which returns a handled error.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB (PRD FR-03)
export const MIN_IMAGE_SIDE = 256;
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;

export const ACCEPTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

/** For `<input accept>`. */
export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export type ImageRejection =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "type_mismatch"
  | "corrupt"
  | "animated"
  | "too_small"
  | "too_many_pixels";

export type ImageValidationResult =
  | { ok: true; mediaType: AcceptedMediaType; width: number; height: number }
  | { ok: false; reason: ImageRejection; message: string };

const MESSAGES: Record<ImageRejection, string> = {
  empty: "The selected file is empty. Choose a photo.",
  too_large: "Photos must be 8 MB or smaller.",
  unsupported_type: "Use a JPG, PNG or WebP photo.",
  type_mismatch: "This file's contents don't match its type. Use a JPG, PNG or WebP photo.",
  corrupt: "This photo couldn't be read. It may be damaged; try another photo.",
  animated: "Animated images aren't supported. Use a still photo.",
  too_small: `The photo is too small. Use one at least ${MIN_IMAGE_SIDE}×${MIN_IMAGE_SIDE} pixels.`,
  too_many_pixels: `The photo's dimensions are too large. Use one up to ${MAX_IMAGE_SIDE} pixels per side.`,
};

function reject(reason: ImageRejection): ImageValidationResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function rejectionMessage(reason: ImageRejection): string {
  return MESSAGES[reason];
}

/** Normalize a declared MIME type; returns null when it isn't accepted. */
export function normalizeMediaType(declared: string): AcceptedMediaType | null {
  const type = declared.split(";")[0]!.trim().toLowerCase();
  if (type === "image/jpg" || type === "image/pjpeg") return "image/jpeg";
  return (ACCEPTED_MEDIA_TYPES as readonly string[]).includes(type) ? (type as AcceptedMediaType) : null;
}

/** Cheap checks on file metadata, usable before reading the bytes. */
export function checkFileBasics(size: number, declaredType: string): ImageValidationResult | null {
  if (size <= 0) return reject("empty");
  if (size > MAX_UPLOAD_BYTES) return reject("too_large");
  // An empty declared type is allowed (some platforms omit it); the signature decides.
  if (declaredType && !normalizeMediaType(declaredType)) return reject("unsupported_type");
  return null;
}

// ---------------------------------------------------------------------------
// Signature sniffing and header parsing
// ---------------------------------------------------------------------------

type Parsed = { mediaType: AcceptedMediaType; width: number; height: number } | { error: "corrupt" | "animated" };

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function startsWith(b: Uint8Array, sig: readonly number[], offset = 0): boolean {
  return b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
}

export function sniffMediaType(b: Uint8Array): AcceptedMediaType | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

function parsePng(b: Uint8Array): Parsed {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4) ...
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return { error: "corrupt" };
  // A complete PNG ends with the IEND chunk; its absence means truncation.
  if (!startsWith(b, PNG_IEND, b.length - PNG_IEND.length)) return { error: "corrupt" };
  // Animated PNGs declare an acTL chunk before the image data.
  for (let o = 8; o + 8 <= b.length; ) {
    const length = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    if (type === "acTL") return { error: "animated" };
    if (type === "IDAT") break;
    o += 12 + length;
  }
  return { mediaType: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

function isJpegSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function parseJpeg(b: Uint8Array): Parsed {
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return { error: "corrupt" };
    let marker = b[o + 1]!;
    while (marker === 0xff && o + 2 < b.length) marker = b[++o + 1]!; // fill bytes
    o += 2;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // standalone markers
    if (marker === 0xd9 || marker === 0xda) return { error: "corrupt" }; // EOI/SOS before any frame header
    const length = u16be(b, o);
    if (length < 2 || o + length > b.length) return { error: "corrupt" };
    if (isJpegSof(marker)) {
      if (length < 7) return { error: "corrupt" };
      const height = u16be(b, o + 3);
      const width = u16be(b, o + 5);
      // The image must be complete: an End Of Image marker must follow the frame header.
      if (!hasMarkerAfter(b, o + length, 0xd9)) return { error: "corrupt" };
      return { mediaType: "image/jpeg", width, height };
    }
    o += length;
  }
  return { error: "corrupt" };
}

function hasMarkerAfter(b: Uint8Array, from: number, marker: number): boolean {
  for (let i = b.length - 2; i >= from; i--) if (b[i] === 0xff && b[i + 1] === marker) return true;
  return false;
}

function parseWebp(b: Uint8Array): Parsed {
  if (b.length < 30) return { error: "corrupt" };
  const riffSize = b[4]! | (b[5]! << 8) | (b[6]! << 16) | ((b[7]! << 24) >>> 0);
  if (riffSize + 8 > b.length) return { error: "corrupt" }; // truncated
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (!startsWith(b, [0x9d, 0x01, 0x2a], 23)) return { error: "corrupt" };
    return { mediaType: "image/webp", width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return { error: "corrupt" };
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | ((b[24]! << 24) >>> 0);
    return { mediaType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (b[20]! & 0x02) return { error: "animated" };
    return { mediaType: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return { error: "corrupt" };
}

/**
 * Validate an uploaded image's bytes. `declaredType` is the browser-reported
 * MIME type (may be empty); it must agree with the sniffed signature.
 */
export function validateImageBytes(bytes: Uint8Array, declaredType: string): ImageValidationResult {
  const basic = checkFileBasics(bytes.length, declaredType);
  if (basic) return basic;

  const sniffed = sniffMediaType(bytes);
  if (!sniffed) return reject(declaredType ? "type_mismatch" : "unsupported_type");
  if (declaredType && normalizeMediaType(declaredType) !== sniffed) return reject("type_mismatch");

  const parsed = sniffed === "image/png" ? parsePng(bytes) : sniffed === "image/jpeg" ? parseJpeg(bytes) : parseWebp(bytes);
  if ("error" in parsed) return reject(parsed.error);

  const { width, height } = parsed;
  if (width < 1 || height < 1) return reject("corrupt");
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) return reject("too_small");
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    return reject("too_many_pixels");
  }
  return { ok: true, mediaType: parsed.mediaType, width, height };
}
