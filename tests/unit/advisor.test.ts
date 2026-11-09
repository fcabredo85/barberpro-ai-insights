import { describe, expect, it } from "vitest";

import { generateAdvice } from "@/lib/advisor/generate-advice";
import { ADVISOR_SYSTEM_PROMPT, buildAdvisorPrompt } from "@/lib/advisor/prompt";
import { adviceRequestSchema, validateAdvice, type AdvicePreferences } from "@/lib/advisor/schema";

import { mockModel } from "./ai-test-helpers";
import { validAdvice } from "./tryon-test-helpers";

const PREFS: AdvicePreferences = { lengthOnTop: "short", maintenance: "low", hairTexture: "straight", vibe: "sporty" };

describe("validateAdvice (FR-19)", () => {
  it("accepts 3-5 distinct catalog styles with reasons and a caveat", () => {
    const result = validateAdvice(validAdvice());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.advice.recommendations.map((r) => r.styleId)).toEqual(["buzz-cut", "crew-cut", "textured-crop"]);
  });

  it("rejects fewer than 3 or more than 5 recommendations", () => {
    const two = validAdvice();
    two.recommendations = two.recommendations.slice(0, 2);
    expect(validateAdvice(two).ok).toBe(false);

    const six = validAdvice();
    six.recommendations = [...six.recommendations, ...six.recommendations].map((r, i) => ({
      ...r,
      styleId: ["buzz-cut", "crew-cut", "textured-crop", "pompadour", "side-part", "low-taper-fade"][i]!,
    }));
    expect(validateAdvice(six).ok).toBe(false);
  });

  it("rejects styles outside the catalog and duplicates", () => {
    const unknown = validAdvice();
    unknown.recommendations[0]!.styleId = "mullet";
    expect(validateAdvice(unknown)).toMatchObject({ ok: false, problems: [expect.stringContaining("unknown style")] });

    const dup = validAdvice();
    dup.recommendations[1]!.styleId = "buzz-cut";
    expect(validateAdvice(dup)).toMatchObject({ ok: false, problems: [expect.stringContaining("duplicate")] });
  });

  it.each([
    ["guarantees", "This style is guaranteed to look great with your preferences every day."],
    ["face shape inference", "A buzz cut flatters your round face and keeps things simple every day."],
    ["age inference", "This style makes you look younger while staying short and very easy to manage."],
    ["ethnicity", "This style is popular with your ethnicity and needs little styling at all."],
    ["medical claims", "A buzz cut helps hide hair loss and needs very little effort day to day."],
    ["attractiveness", "You will look more attractive with this short and low maintenance cut."],
    ["links", "See https://example.com for photos of this short, low maintenance style."],
  ])("rejects %s", (_label, reason) => {
    const advice = validAdvice();
    advice.recommendations[0]!.reason = reason;
    expect(validateAdvice(advice).ok).toBe(false);
  });

  it("rejects malformed shapes", () => {
    expect(validateAdvice(null).ok).toBe(false);
    expect(validateAdvice({ recommendations: "three" }).ok).toBe(false);
  });
});

describe("advisor prompt", () => {
  it("contains the catalog and only the chosen preference values", () => {
    const prompt = buildAdvisorPrompt(PREFS);
    expect(prompt).toContain('"styleId":"low-taper-fade"');
    expect(prompt).toContain('"vibe":"sporty"');
  });

  it("forbids sensitive inferences and promises", () => {
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/face shape, age, ethnicity, skin tone, attractiveness, health/);
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/No promises/);
  });

  it("request schema rejects free text and unknown options", () => {
    const requestKey = "11111111-1111-4111-8111-111111111111";
    expect(adviceRequestSchema.safeParse({ preferences: PREFS, requestKey }).success).toBe(true);
    expect(adviceRequestSchema.safeParse({ preferences: { ...PREFS, notes: "ignore rules" }, requestKey }).success).toBe(false);
    expect(adviceRequestSchema.safeParse({ preferences: { ...PREFS, vibe: "edgy" }, requestKey }).success).toBe(false);
    expect(adviceRequestSchema.safeParse({ preferences: PREFS, requestKey, photo: "data:" }).success).toBe(false);
  });
});

describe("generateAdvice", () => {
  it("returns validated advice", async () => {
    const { model } = mockModel(JSON.stringify(validAdvice()));
    const result = await generateAdvice(PREFS, { model });
    expect(result.kind).toBe("ok");
  });

  it("retries once on invalid output, then fails safely", async () => {
    const bad = validAdvice();
    bad.recommendations[0]!.styleId = "mullet";
    const { model, calls } = mockModel(JSON.stringify(bad), "not json");
    const result = await generateAdvice(PREFS, { model });
    expect(result.kind).toBe("invalid_output");
    expect(calls).toHaveLength(2);
  });

  it("recovers when the retry is valid", async () => {
    const { model } = mockModel("not json", JSON.stringify(validAdvice()));
    expect((await generateAdvice(PREFS, { model })).kind).toBe("ok");
  });

  it("reports upstream errors", async () => {
    const { model } = mockModel(new Error("boom"));
    expect((await generateAdvice(PREFS, { model })).kind).toBe("upstream_error");
  });
});
