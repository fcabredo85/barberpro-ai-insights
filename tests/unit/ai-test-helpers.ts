import { MockLanguageModelV4 } from "ai/test";

import { buildSalesReport, type SalesReport } from "@/lib/business/metrics";

export const PAOLO_ID = "11111111-1111-4111-8111-111111111111";
export const MIGS_ID = "22222222-2222-4222-8222-222222222222";

/** 7-day report: ₱1,549.96 over 6 sales; barbers Paolo and Migs (real names). */
export function sampleReport(): SalesReport {
  return buildSalesReport(
    {
      totals: { grossCentavos: 154_996, commissionCentavos: 56_330, transactions: 6, quantity: 9 },
      daily: [
        { date: "2026-11-02", grossCentavos: 50_000, commissionCentavos: 20_000, transactions: 2 },
        { date: "2026-11-06", grossCentavos: 104_996, commissionCentavos: 36_330, transactions: 4 },
      ],
      byBarber: [
        { id: MIGS_ID, name: "Migs", grossCentavos: 84_997, commissionCentavos: 28_330, transactions: 3, quantity: 5 },
        { id: PAOLO_ID, name: "Paolo", grossCentavos: 69_999, commissionCentavos: 28_000, transactions: 3, quantity: 4 },
      ],
      byService: [
        { id: "33333333-3333-4333-8333-333333333333", name: "Beard trim", grossCentavos: 79_996, commissionCentavos: 30_000, transactions: 3, quantity: 4 },
        { id: "44444444-4444-4444-8444-444444444444", name: "Haircut", grossCentavos: 75_000, commissionCentavos: 26_330, transactions: 3, quantity: 5 },
      ],
    },
    "2026-10-31",
    "2026-11-06",
  );
}

/** A valid model response referring to the pseudonymized barbers. */
export function validModelOutput() {
  return {
    insights: [
      {
        title: "Barber 1 leads gross sales",
        observation: "Barber 1 brought in ₱849.97, the highest of any barber and 54.8% of gross sales.",
        evidenceFactIds: ["barber_1_gross", "barber_1_share"],
        action: "Schedule Barber 1 on your busiest days and ask them to share upselling tips with the team.",
      },
      {
        title: "Beard trims are the top service",
        observation: "Beard trim earned ₱799.96, slightly ahead of Haircut at ₱750.00.",
        evidenceFactIds: ["service_1_gross", "service_2_gross"],
        action: "Offer a beard trim add-on when customers book a haircut to grow both services.",
      },
      {
        title: "Sales cluster on few days",
        observation: "Only 2 of the 7 days had sales, with the best day reaching ₱1,049.96.",
        evidenceFactIds: ["days_with_sales", "days_in_range", "best_day_gross"],
        action: "Promote quieter days with a social media post and track whether walk-ins rise.",
      },
    ],
  };
}

const USAGE = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 200, text: 200, reasoning: undefined },
};

export type MockReply = string | Error;

/** Mock model that replies with the given texts (or throws errors) in order. */
export function mockModel(...replies: MockReply[]) {
  const calls: Array<{ prompt: unknown; tools: unknown }> = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      calls.push({ prompt: options.prompt, tools: options.tools });
      const reply = replies[Math.min(i++, replies.length - 1)]!;
      if (reply instanceof Error) throw reply;
      return {
        content: [{ type: "text", text: reply }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      };
    },
  });
  return { model, calls };
}
