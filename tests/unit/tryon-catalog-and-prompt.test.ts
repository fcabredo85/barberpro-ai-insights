import { describe, expect, it } from "vitest";

import { PHOTO_CONSENT_NOTICE, SIMULATION_DISCLAIMER } from "@/lib/tryon/consent";
import { buildTryOnPrompt } from "@/lib/tryon/prompt";
import { DEFAULT_HAIRSTYLE_ID, HAIRSTYLES, HAIRSTYLE_IDS, getHairstyle, isHairstyleId } from "@/lib/tryon/styles";

describe("hairstyle catalog (FR-02, FR-06)", () => {
  it("defaults to Low Taper Fade", () => {
    expect(DEFAULT_HAIRSTYLE_ID).toBe("low-taper-fade");
    expect(getHairstyle(DEFAULT_HAIRSTYLE_ID).name).toBe("Low Taper Fade");
  });

  it("has the six PRD styles with stable kebab-case IDs, in order", () => {
    expect(HAIRSTYLES.map((s) => s.id)).toEqual([
      "low-taper-fade",
      "textured-crop",
      "pompadour",
      "buzz-cut",
      "side-part",
      "crew-cut",
    ]);
    expect([...HAIRSTYLE_IDS]).toEqual(HAIRSTYLES.map((s) => s.id));
    for (const style of HAIRSTYLES) expect(style.id).toMatch(/^[a-z0-9-]{1,64}$/); // matches DB check
  });

  it("gives every style a name, description and barber notes", () => {
    for (const style of HAIRSTYLES) {
      expect(style.name.length).toBeGreaterThan(2);
      expect(style.description.length).toBeGreaterThan(20);
      expect(style.barberNotes.length).toBeGreaterThan(20);
      expect(style.promptDescription.length).toBeGreaterThan(20);
    }
  });

  it("recognizes only catalog IDs", () => {
    expect(isHairstyleId("pompadour")).toBe(true);
    expect(isHairstyleId("Pompadour")).toBe(false);
    expect(isHairstyleId("mullet")).toBe(false);
    expect(isHairstyleId(42)).toBe(false);
  });

  it("never promises precise guard numbers or guaranteed outcomes", () => {
    for (const style of HAIRSTYLES) {
      const text = `${style.description} ${style.barberNotes}`;
      expect(text).not.toMatch(/#\d|guard \d|\bguarantee/i);
    }
  });
});

describe("try-on prompt (FR-08)", () => {
  const prompt = buildTryOnPrompt(getHairstyle("buzz-cut"));

  it("names the selected style and its catalog description", () => {
    expect(prompt).toContain("Buzz Cut");
    expect(prompt).toContain(getHairstyle("buzz-cut").promptDescription);
  });

  it("asks to preserve identity, face, skin, pose, clothing and background", () => {
    for (const word of ["same individual", "facial features", "skin tone", "pose", "clothing", "background"]) {
      expect(prompt).toContain(word);
    }
  });

  it("forbids text and watermarks", () => {
    expect(prompt).toMatch(/Do not add text.*watermarks/);
  });
});

describe("disclosure copy (FR-05, FR-11)", () => {
  it("names the external provider and that nothing is saved", () => {
    const notice = PHOTO_CONSENT_NOTICE.points.join(" ");
    expect(notice).toMatch(/OpenAI/);
    expect(notice).toMatch(/does not save/);
  });

  it("states results are not guaranteed", () => {
    expect(SIMULATION_DISCLAIMER).toMatch(/AI-generated simulation/);
    expect(SIMULATION_DISCLAIMER).toMatch(/not guaranteed/);
  });
});
