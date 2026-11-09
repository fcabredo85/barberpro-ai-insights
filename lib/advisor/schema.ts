import { z } from "zod";

import { HAIRSTYLE_IDS, isHairstyleId, type HairstyleId } from "@/lib/tryon/styles";

/**
 * AI Hairstyle Advisor (PRD FR-19). Inputs are self-reported preferences
 * chosen from fixed options: no photo, no free text. This keeps the advisor
 * from inferring appearance or sensitive traits and blocks prompt injection.
 */
export const LENGTH_OPTIONS = ["short", "medium", "long", "no_preference"] as const;
export const MAINTENANCE_OPTIONS = ["low", "medium", "high"] as const;
export const TEXTURE_OPTIONS = ["straight", "wavy", "curly", "coily", "not_sure"] as const;
export const VIBE_OPTIONS = ["classic", "modern", "professional", "sporty", "bold", "no_preference"] as const;

export const advicePreferencesSchema = z.strictObject(
  {
    lengthOnTop: z.enum(LENGTH_OPTIONS, { error: "Choose a length." }),
    maintenance: z.enum(MAINTENANCE_OPTIONS, { error: "Choose a maintenance level." }),
    hairTexture: z.enum(TEXTURE_OPTIONS, { error: "Choose a hair texture." }),
    vibe: z.enum(VIBE_OPTIONS, { error: "Choose a style vibe." }),
  },
  { error: "Unexpected field in request." },
);

export type AdvicePreferences = z.infer<typeof advicePreferencesSchema>;

export const adviceRequestSchema = z.strictObject(
  {
    preferences: advicePreferencesSchema,
    requestKey: z.uuid({ error: "Missing or invalid request key." }),
  },
  { error: "Unexpected field in request." },
);

export const ADVICE_DISCLAIMER =
  "AI suggestions based only on the preferences you selected. Your barber will confirm what suits your hair in person.";

export const MIN_RECOMMENDATIONS = 3;
export const MAX_RECOMMENDATIONS = 5;

/** Loose shape requested from the model; strict rules are applied afterwards. */
export const adviceModelOutputSchema = z.object({
  recommendations: z.array(
    z.object({
      styleId: z.string().describe(`One of: ${HAIRSTYLE_IDS.join(", ")}`),
      reason: z.string().describe("1-2 sentences linking the style to the stated preferences."),
    }),
  ),
  caveat: z.string().describe("One sentence on uncertainty and consulting the barber."),
});

export interface Recommendation {
  styleId: HairstyleId;
  reason: string;
}

export interface Advice {
  recommendations: Recommendation[];
  caveat: string;
}

const strictSchema = z.object({
  recommendations: z
    .array(z.object({ styleId: z.string(), reason: z.string().trim().min(20).max(300) }))
    .min(MIN_RECOMMENDATIONS)
    .max(MAX_RECOMMENDATIONS),
  caveat: z.string().trim().min(20).max(300),
});

/** Certainty language: previews and advice are never guaranteed. */
const CERTAINTY = [/\bguarantee[sd]?\b/i, /\bwill (definitely|certainly|surely)\b/i, /\b100%/i, /\bperfect (match|fit|for you)\b/i];

/**
 * Sensitive-trait, appearance-judgment and medical language the advisor must
 * never use (PRD §8, CLAUDE.md security rule 4). The model never sees a photo,
 * so any such claim would also be fabricated.
 */
const SENSITIVE = [
  /\b(ethnic|ethnicity|race|racial|nationality)\b/i,
  /\bskin (tone|color|colour)\b/i,
  /\b(age|aged|older|younger|youthful)\b/i,
  /\b(attractive|unattractive|handsome|ugly|sexy)\b/i,
  /\bface shape\b|\b(round|square|oval|long|heart[- ]shaped) face\b/i,
  /\b(balding|bald spot|hair ?loss|alopecia|thinning|receding|dandruff|scalp condition|medical|diagnos\w*)\b/i,
];

export type AdviceValidation = { ok: true; advice: Advice } | { ok: false; problems: string[] };

/** Enforce the advice contract on raw model output. Rejects; never repairs. */
export function validateAdvice(raw: unknown): AdviceValidation {
  const parsed = strictSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "output"}: ${i.message}`) };
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const texts: Array<[string, string]> = [["caveat", parsed.data.caveat]];

  parsed.data.recommendations.forEach((rec, i) => {
    if (!isHairstyleId(rec.styleId)) problems.push(`recommendations.${i}: unknown style "${rec.styleId}"`);
    if (seen.has(rec.styleId)) problems.push(`recommendations.${i}: duplicate style`);
    seen.add(rec.styleId);
    texts.push([`recommendations.${i}.reason`, rec.reason]);
  });

  for (const [where, text] of texts) {
    if (CERTAINTY.some((re) => re.test(text))) problems.push(`${where}: certainty language`);
    if (SENSITIVE.some((re) => re.test(text))) problems.push(`${where}: sensitive or medical language`);
    if (/https?:\/\/|www\./i.test(text)) problems.push(`${where}: contains a link`);
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    advice: {
      recommendations: parsed.data.recommendations.map((r) => ({ styleId: r.styleId as HairstyleId, reason: r.reason.trim() })),
      caveat: parsed.data.caveat.trim(),
    },
  };
}
