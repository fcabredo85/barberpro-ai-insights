/**
 * Virtual Try-On hairstyle catalog (PRD FR-06).
 *
 * IDs are stable keys: they are sent by the client, recorded on AI jobs and
 * will be seeded into `hairstyle_catalog` later. Never use display names as
 * keys, and never rename an ID once released (add a new one instead).
 *
 * `promptDescription` is the only catalog text sent to the image model. It is
 * server-controlled, so customers cannot inject prompt text via a style.
 */
export const HAIRSTYLE_IDS = [
  "low-taper-fade",
  "textured-crop",
  "pompadour",
  "buzz-cut",
  "side-part",
  "crew-cut",
] as const;

export type HairstyleId = (typeof HAIRSTYLE_IDS)[number];

/** PRD FR-02: the studio opens with Low Taper Fade selected. */
export const DEFAULT_HAIRSTYLE_ID: HairstyleId = "low-taper-fade";

export type Maintenance = "low" | "medium" | "high";
export type LengthOnTop = "short" | "medium" | "long";

export interface Hairstyle {
  id: HairstyleId;
  name: string;
  /** Customer-facing summary. */
  description: string;
  /** Professional notes for the barber; advisory, not a guaranteed result. */
  barberNotes: string;
  /** Server-controlled wording used inside the image-edit prompt. */
  promptDescription: string;
  lengthOnTop: LengthOnTop;
  maintenance: Maintenance;
  /** Short tags the advisor can match against stated preferences. */
  tags: readonly string[];
}

export const HAIRSTYLES: readonly Hairstyle[] = [
  {
    id: "low-taper-fade",
    name: "Low Taper Fade",
    description: "Clean, low-profile taper around the ears and neckline with natural length kept on top.",
    barberNotes:
      "Taper starts just above the ear and at the nape, blending into scissor or clipper length on top. Keep the sides and back gradual; confirm guard lengths in consultation.",
    promptDescription:
      "a low taper fade: hair gradually tapered very short just above the ears and at the neckline, blending smoothly upward, with natural medium-short length left on top, neatly styled",
    lengthOnTop: "medium",
    maintenance: "medium",
    tags: ["clean", "versatile", "professional", "subtle"],
  },
  {
    id: "textured-crop",
    name: "Textured Crop",
    description: "Short, choppy texture on top with a short fringe and tidy faded sides.",
    barberNotes:
      "Point-cut or texturize the top for movement, push a short fringe forward and pair with a mid or high fade. Matte product finishes the look.",
    promptDescription:
      "a textured crop: short choppy textured hair on top pushed slightly forward into a short straight fringe, with short faded sides",
    lengthOnTop: "short",
    maintenance: "low",
    tags: ["modern", "textured", "easy", "casual"],
  },
  {
    id: "pompadour",
    name: "Pompadour",
    description: "Volume swept up and back on top, with shorter, neat sides.",
    barberNotes:
      "Leave enough length on top for lift (consult on current length). Shorter tapered or faded sides; requires blow-drying and pomade for daily styling.",
    promptDescription:
      "a classic pompadour: longer hair on top swept upward and back with noticeable volume at the front, glossy neat finish, with shorter tapered sides",
    lengthOnTop: "long",
    maintenance: "high",
    tags: ["classic", "bold", "volume", "formal"],
  },
  {
    id: "buzz-cut",
    name: "Buzz Cut",
    description: "Uniform, very short clipper cut all over for a sharp, no-fuss look.",
    barberNotes:
      "Even clipper length all over; optional lined-up edges. Discuss the preferred guard in person; scalp visibility varies by hair density.",
    promptDescription:
      "a buzz cut: uniformly very short clipper-cut hair all over the head with a clean, even length and tidy hairline edges",
    lengthOnTop: "short",
    maintenance: "low",
    tags: ["minimal", "sporty", "easy", "sharp"],
  },
  {
    id: "side-part",
    name: "Side Part",
    description: "Timeless combed look with a defined side part and tapered sides.",
    barberNotes:
      "Find the natural part; optional hard part only on request. Scissor-over-comb or taper on the sides; light-hold product for a neat finish.",
    promptDescription:
      "a classic side part: medium-length hair on top combed neatly to one side with a defined side part, and shorter tapered sides",
    lengthOnTop: "medium",
    maintenance: "medium",
    tags: ["classic", "professional", "neat", "formal"],
  },
  {
    id: "crew-cut",
    name: "Crew Cut",
    description: "Short, tidy top that gets slightly longer toward the front, with short sides.",
    barberNotes:
      "Short top graduating slightly longer at the front hairline; short tapered sides and back. Simple daily styling with little or no product.",
    promptDescription:
      "a crew cut: short hair on top, slightly longer at the front hairline, with short tapered sides and back, neat and natural",
    lengthOnTop: "short",
    maintenance: "low",
    tags: ["classic", "easy", "neat", "sporty"],
  },
];

const BY_ID = new Map<string, Hairstyle>(HAIRSTYLES.map((style) => [style.id, style]));

export function isHairstyleId(value: unknown): value is HairstyleId {
  return typeof value === "string" && BY_ID.has(value);
}

export function getHairstyle(id: HairstyleId): Hairstyle {
  return BY_ID.get(id)!;
}
