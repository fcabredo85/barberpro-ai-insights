import { z } from "zod";

import { LOOK_STORAGE_NOTICE_VERSION } from "@/lib/tryon/consent";

/** Text fields of the multipart POST /api/looks request. */
export const saveLookFieldsSchema = z.object({
  tryOnJobId: z.uuid({ error: "This preview can't be saved. Generate it again." }),
  customerLabel: z
    .string({ error: "Enter the customer's name." })
    .trim()
    .min(1, { error: "Enter the customer's name." })
    .max(100, { error: "Use 100 characters or fewer." }),
  title: z
    .string()
    .trim()
    .max(100, { error: "Use 100 characters or fewer." })
    .optional()
    .transform((v) => (v ? v : undefined)),
  storageConsent: z.literal("granted", { error: "The customer's consent to store the photos is required." }),
  storageNoticeVersion: z.literal(LOOK_STORAGE_NOTICE_VERSION, {
    error: "The storage notice has changed. Reload the page and review it again.",
  }),
});

export type SaveLookFields = z.infer<typeof saveLookFieldsSchema>;

export const lookIdSchema = z.uuid();

/** A saved look as returned to the client, with short-lived signed URLs. */
export interface SavedLookView {
  id: string;
  customerLabel: string;
  title: string | null;
  styleId: string;
  styleName: string;
  createdAt: string;
  deleteAfter: string;
  originalUrl: string | null;
  previewUrl: string | null;
}
