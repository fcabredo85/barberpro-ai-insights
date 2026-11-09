/**
 * Photo-processing consent notice (PRD FR-05, §12).
 *
 * The version is recorded with every consent so we can prove which wording a
 * person agreed to. Bump it whenever the notice text changes; the server
 * rejects consent given against an outdated version.
 *
 * DRAFT WORDING: this notice must be reviewed for the Philippine Data Privacy
 * Act (purpose, provider transfer, retention, data subject rights) before
 * production launch.
 */
export const PHOTO_CONSENT_NOTICE_VERSION = "2026-11-08.draft-1";

export const PHOTO_CONSENT_PURPOSE = "ai_hairstyle_preview" as const;

export const PHOTO_CONSENT_NOTICE = {
  heading: "Photo processing consent",
  points: [
    "Your photo is sent to OpenAI, an external AI service, only to create this hairstyle preview. OpenAI may keep request data for a limited time under its own policies.",
    "BarberPro AI does not save the photo or the preview. They are discarded when you leave or replace the photo.",
    "We record that you agreed, when, and to which notice version, but never the photo itself.",
    "The preview is an AI simulation. Your real haircut may look different.",
  ],
  checkboxLabel:
    "I am the person in this photo, or they are present and have agreed, and I consent to sending it to OpenAI to generate a hairstyle preview.",
} as const;

/** Shown next to every generated preview (PRD FR-11). */
export const SIMULATION_LABEL = "AI-generated simulation" as const;

export const SIMULATION_DISCLAIMER =
  "AI-generated simulation for consultation only. Your actual haircut depends on your hair, the barber's assessment and styling; results are not guaranteed.";

/**
 * Separate, optional consent to KEEP the photos (PRD §12: storage is a
 * distinct purpose from AI processing). DRAFT wording and retention period,
 * pending legal/product approval. Bump the version when the text changes.
 */
export const LOOK_STORAGE_NOTICE_VERSION = "2026-11-08.storage-draft-1";
export const LOOK_RETENTION_DAYS = 90; // must match create_saved_look()

export const LOOK_STORAGE_NOTICE = {
  heading: "Save this look",
  points: [
    `The original photo and the AI preview are stored privately by this barbershop for up to ${LOOK_RETENTION_DAYS} days, then deleted automatically.`,
    "Only staff of this barbershop can see them. They are never public.",
    "The customer can ask staff to delete the look at any time.",
  ],
  checkboxLabel:
    "The customer agrees to this barbershop storing their photo and AI preview for future consultations.",
} as const;
