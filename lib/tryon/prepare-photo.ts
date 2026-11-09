import { MIN_IMAGE_SIDE, checkFileBasics, validateImageBytes, type ImageValidationResult } from "./image-validation";

/** Longest side sent to the server. Plenty for a preview; keeps uploads small. */
export const UPLOAD_MAX_SIDE = 2048;

export type PreparedPhoto =
  | { ok: true; upload: Blob; previewUrl: string; width: number; height: number }
  | { ok: false; message: string };

/**
 * Browser-side preparation of a selfie:
 * 1. Validate the ORIGINAL file with the same rules the server uses (FR-03).
 * 2. Decode it (a real decode check) and re-encode as JPEG, at most
 *    UPLOAD_MAX_SIDE px. Re-encoding drops EXIF metadata such as GPS location
 *    and keeps the request under hosting body-size limits (Vercel: ~4.5 MB).
 *
 * The server re-validates whatever it receives; this is not a security check.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const basic = checkFileBasics(file.size, file.type);
  if (basic && !basic.ok) return { ok: false, message: basic.message };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked: ImageValidationResult = validateImageBytes(bytes, file.type);
  if (!checked.ok) return { ok: false, message: checked.message };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, message: "This photo couldn't be read. It may be damaged; try another photo." };
  }

  try {
    // Fit the long side to UPLOAD_MAX_SIDE, but never shrink the short side below
    // the server's minimum (matters for very wide or tall photos).
    const longSide = Math.max(bitmap.width, bitmap.height);
    const shortSide = Math.min(bitmap.width, bitmap.height);
    const scale = Math.min(1, Math.max(UPLOAD_MAX_SIDE / longSide, MIN_IMAGE_SIDE / shortSide));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const upload = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!upload) throw new Error("encode failed");
    return { ok: true, upload, previewUrl: URL.createObjectURL(upload), width, height };
  } catch {
    return { ok: false, message: "This photo couldn't be processed in your browser. Try another photo." };
  } finally {
    bitmap.close();
  }
}
