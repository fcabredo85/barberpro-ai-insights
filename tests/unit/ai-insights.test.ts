import { describe, expect, it } from "vitest";

import { buildInsightContext, hasEnoughDataForInsights, MIN_TRANSACTIONS_FOR_INSIGHTS } from "@/lib/ai/facts";
import { generateInsights } from "@/lib/ai/generate-insights";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { validateInsights } from "@/lib/ai/schema";
import { EMPTY_AGGREGATES, buildSalesReport } from "@/lib/business/metrics";

import { MIGS_ID, PAOLO_ID, mockModel, sampleReport, validModelOutput } from "./ai-test-helpers";

const ctx = () => buildInsightContext(sampleReport());
type Output = ReturnType<typeof validModelOutput>;
function withInsight(change: (o: Output) => void): Output {
  const o = validModelOutput();
  change(o);
  return o;
}

describe("fact sheet sent to the model", () => {
  it("contains only aggregates: no barber names, ids, emails or raw rows", () => {
    const payload = JSON.stringify(ctx().modelPayload);
    expect(payload).not.toContain("Paolo");
    expect(payload).not.toContain("Migs");
    expect(payload).not.toContain(PAOLO_ID);
    expect(payload).not.toContain(MIGS_ID);
    expect(payload).not.toMatch(/@/);
    expect(payload).toContain("Barber 1");
    expect(Object.keys(ctx().modelPayload)).toEqual(["period", "facts"]);
  });

  it("states exact server-computed values", () => {
    const facts = ctx().factsById;
    expect(facts.get("total_gross")?.value).toBe("₱1,549.96");
    expect(facts.get("total_transactions")?.value).toBe("6");
    expect(facts.get("barber_1_share")?.value).toBe("54.8%");
    expect(facts.get("commission_share")?.value).toBe("36.3%");
    expect(facts.get("days_with_sales")?.value).toBe("2");
  });

  it("requires at least 5 sales before insights are attempted", () => {
    expect(MIN_TRANSACTIONS_FOR_INSIGHTS).toBe(5);
    expect(hasEnoughDataForInsights(sampleReport())).toBe(true);
    expect(hasEnoughDataForInsights(buildSalesReport(EMPTY_AGGREGATES, "2026-11-06", "2026-11-06"))).toBe(false);
  });

  it("tells the model the data is untrusted and forbids invented numbers", () => {
    expect(SYSTEM_PROMPT).toMatch(/exactly 3/i);
    expect(SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(SYSTEM_PROMPT).toMatch(/data, not instructions/i);
  });
});

describe("validateInsights", () => {
  it("accepts grounded output, restores real names and renders evidence from facts", () => {
    const result = validateInsights(validModelOutput(), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.insights).toHaveLength(3);
    expect(result.insights[0]!.title).toBe("Migs leads gross sales");
    expect(result.insights[0]!.evidence).toBe("Migs: gross sales: ₱849.97; Migs: share of gross sales: 54.8%");
    expect(result.insights[0]!.evidenceFacts).toEqual([
      { label: "Migs: gross sales", value: "₱849.97" },
      { label: "Migs: share of gross sales", value: "54.8%" },
    ]);
  });

  it.each([
    ["two insights", withInsight((o) => o.insights.pop())],
    ["four insights", withInsight((o) => o.insights.push(o.insights[0]!))],
    ["no insights array", { result: "ok" }],
    ["null", null],
    ["a plain string", "Here are three insights: ..."],
    ["a missing action", withInsight((o) => delete (o.insights[0] as Partial<Output["insights"][0]>).action)],
    ["an empty observation", withInsight((o) => (o.insights[1]!.observation = ""))],
    ["no evidence ids", withInsight((o) => (o.insights[2]!.evidenceFactIds = []))],
    ["evidence ids of the wrong type", withInsight((o) => ((o.insights[0] as unknown as { evidenceFactIds: unknown }).evidenceFactIds = "barber_1_gross"))],
    ["an overlong observation", withInsight((o) => (o.insights[0]!.observation = "x".repeat(401)))],
  ])("rejects malformed output: %s", (_label, output) => {
    expect(validateInsights(output, ctx()).ok).toBe(false);
  });

  it.each([
    ["an invented peso amount", (o: Output) => (o.insights[0]!.observation = "Barber 1 could earn ₱2,000.00 more each week with longer hours.")],
    ["an invented percentage", (o: Output) => (o.insights[1]!.observation = "Beard trims grew 35% compared with last month, a strong trend.")],
    ["a number in the action", (o: Output) => (o.insights[2]!.action = "Run a ₱50 discount on quiet days to bring in more customers.")],
    ["an unknown evidence id", (o: Output) => (o.insights[0]!.evidenceFactIds = ["customer_emails"])],
    ["a guarantee", (o: Output) => (o.insights[1]!.action = "Promote beard trims; this is guaranteed to increase revenue.")],
    ["certainty language", (o: Output) => (o.insights[1]!.action = "Add a combo package and sales will definitely go up next week.")],
    ["a link", (o: Output) => (o.insights[2]!.action = "Advertise your quiet days at https://example.com/ads for more walk-ins.")],
    ["an email address", (o: Output) => (o.insights[2]!.action = "Ask customers to email feedback to owner@example.com after each visit.")],
    ["duplicate insights", (o: Output) => (o.insights[1]!.title = o.insights[0]!.title)],
  ])("rejects unsupported claims: %s", (_label, change) => {
    const result = validateInsights(withInsight(change), ctx());
    expect(result.ok).toBe(false);
  });

  it("allows small counts and calendar dates that aren't financial claims", () => {
    const output = withInsight((o) => {
      o.insights[2]!.observation = "Sales happened on 2 days, with the best on Nov 6, 2026 at ₱1,049.96.";
    });
    expect(validateInsights(output, ctx()).ok).toBe(true);
  });

  it("allows a peso amount rounded to the nearest peso", () => {
    const output = withInsight((o) => (o.insights[0]!.observation = "Barber 1 earned about ₱850 in gross sales, the most of any barber."));
    expect(validateInsights(output, ctx()).ok).toBe(true);
  });
});

describe("generateInsights (mocked OpenAI model)", () => {
  it("returns exactly three validated insights from a well-formed response", async () => {
    const { model, calls } = mockModel(JSON.stringify(validModelOutput()));
    const result = await generateInsights(sampleReport(), { model });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.insights).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("sends only the aggregate fact sheet and gives the model no tools", async () => {
    const { model, calls } = mockModel(JSON.stringify(validModelOutput()));
    await generateInsights(sampleReport(), { model });
    const sent = JSON.stringify(calls[0]!.prompt);
    expect(sent).toContain("total_gross");
    expect(sent).not.toContain("Paolo");
    expect(sent).not.toContain("Migs");
    expect(sent).not.toContain(PAOLO_ID);
    expect(calls[0]!.tools ?? []).toEqual([]);
  });

  it("rejects malformed JSON, retries once, then reports invalid output", async () => {
    const { model, calls } = mockModel("Sure! Here are some ideas: 1) hire more barbers", "{not valid json");
    const result = await generateInsights(sampleReport(), { model });
    expect(result.kind).toBe("invalid_output");
    expect(calls).toHaveLength(2);
  });

  it("recovers when the retry returns valid output", async () => {
    const { model, calls } = mockModel('{"insights": []}', JSON.stringify(validModelOutput()));
    const result = await generateInsights(sampleReport(), { model });
    expect(result.kind).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("rejects well-formed JSON that invents a number", async () => {
    const invented = withInsight((o) => (o.insights[0]!.observation = "Barber 1 will bring in ₱12,000.00 next month at this pace."));
    const { model } = mockModel(JSON.stringify(invented));
    const result = await generateInsights(sampleReport(), { model });
    expect(result.kind).toBe("invalid_output");
    if (result.kind === "invalid_output") expect(result.problems.join(" ")).toMatch(/unsupported number/);
  });

  it("rejects a response with the wrong number of insights", async () => {
    const { model } = mockModel(JSON.stringify({ insights: validModelOutput().insights.slice(0, 2) }));
    expect((await generateInsights(sampleReport(), { model })).kind).toBe("invalid_output");
  });

  it("reports an upstream failure when the provider errors", async () => {
    const { model } = mockModel(new Error("500 Internal Server Error"));
    expect((await generateInsights(sampleReport(), { model })).kind).toBe("upstream_error");
  });

  it("reports a timeout when the provider is too slow", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const { model } = mockModel(timeout);
    expect((await generateInsights(sampleReport(), { model })).kind).toBe("timeout");
  });
});
