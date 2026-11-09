import { z } from "zod";

import { PHOTO_CONSENT_NOTICE_VERSION } from "@/lib/tryon/consent";
import { HAIRSTYLE_IDS } from "@/lib/tryon/styles";

/**
 * Text fields of the multipart POST /api/try-on request. The photo itself is
 * validated separately by validateImageBytes().
 */
export const tryOnFieldsSchema = z.object({
  styleId: z.enum(HAIRSTYLE_IDS, { error: "Choose a hairstyle from the list." }),
  // Must be the literal "granted": an unchecked box sends nothing.
  consent: z.literal("granted", { error: "Consent to photo processing is required." }),
  consentNoticeVersion: z.literal(PHOTO_CONSENT_NOTICE_VERSION, {
    error: "The consent notice has changed. Reload the page and review it again.",
  }),
  requestKey: z.uuid({ error: "Missing or invalid request key." }),
});

export type TryOnFields = z.infer<typeof tryOnFieldsSchema>;

/** Successful response payload (inside `{ data }`). */
export interface TryOnResponse {
  status: "ok";
  jobId: string;
  styleId: string;
  styleName: string;
  preview: { dataUrl: string; mediaType: string };
  label: "AI-generated simulation";
  disclaimer: string;
  generatedAt: string;
}
