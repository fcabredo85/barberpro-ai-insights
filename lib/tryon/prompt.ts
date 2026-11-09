import type { Hairstyle } from "./styles";

/**
 * Image-edit instruction (PRD §8, FR-08). Built only from server-controlled
 * catalog text; no customer free text ever reaches this prompt.
 *
 * Deliberately avoids asking the model to judge or describe the person
 * (no age, ethnicity, attractiveness or health inference).
 */
export function buildTryOnPrompt(style: Hairstyle): string {
  return [
    "Edit this customer-authorized portrait for a hairstyle consultation.",
    "Keep the same individual, expression, facial features, apparent age, skin tone, facial hair, pose, clothing, lighting and background as close to the source as practical.",
    `Change only the hairstyle to ${style.name}: ${style.promptDescription}.`,
    "Keep the person's existing hair color and natural hairline unless the style requires shorter length.",
    "Produce a photorealistic, natural-looking approximation at the same framing and crop.",
    "Do not add text, logos, watermarks, accessories or makeup.",
  ].join(" ");
}
