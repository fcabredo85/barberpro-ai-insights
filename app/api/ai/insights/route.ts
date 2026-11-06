import { generateInsights } from "@/lib/ai/generate-insights";
import { MIN_TRANSACTIONS_FOR_INSIGHTS, hasEnoughDataForInsights } from "@/lib/ai/facts";
import { getInsightsModel } from "@/lib/ai/model";
import { apiError, apiSuccess } from "@/lib/api/response";
import { consumeAiInsightQuota } from "@/lib/db/ai-quota";
import { getSalesReport } from "@/lib/db/metrics";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser } from "@/lib/db/workspace";
import { insightsRequestSchema } from "@/lib/validation/insights";
import { parseReportRange } from "@/lib/validation/report-range";
import { issuesByField } from "@/lib/validation/sales";

// Model calls can take a while; allow up to 60s on Vercel.
export const maxDuration = 60;

/**
 * POST /api/ai/insights  { range?: "today"|"7d"|"30d"|"90d", from?, to? }
 *
 * Owner-only. Computes the report server-side, sends ONLY its aggregate fact
 * sheet to the model, validates the structured output, and returns exactly
 * three insights, or an informative insufficient-data result.
 *
 * 200 ok | 200 insufficient_data | 400 | 401 | 403 | 415 | 429 | 503
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.");
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "UNAUTHENTICATED", "Sign in to generate insights.");

    const workspace = await findWorkspaceForUser(supabase, user.id);
    if (!workspace) return apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.");
    if (workspace.role !== "owner") return apiError(403, "FORBIDDEN", "Only the barbershop owner can generate AI insights.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }
    const parsedBody = insightsRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError(400, "VALIDATION_ERROR", "Check the request and try again.", issuesByField(parsedBody.error));
    }
    const range = parseReportRange(parsedBody.data);
    if (!range.ok) return apiError(400, "VALIDATION_ERROR", "Check the date range and try again.", range.fields);

    // Aggregates are computed by the server for the caller's own shop (RLS applies).
    const report = await getSalesReport(supabase, workspace.barbershopId, range.from, range.to);
    const period = { from: range.from, to: range.to, timeZone: "Asia/Manila" as const };

    if (!hasEnoughDataForInsights(report)) {
      return apiSuccess({
        status: "insufficient_data" as const,
        period,
        insights: [],
        transactionCount: report.totals.transactionCount,
        requiredTransactions: MIN_TRANSACTIONS_FOR_INSIGHTS,
        message: `AI insights need at least ${MIN_TRANSACTIONS_FOR_INSIGHTS} recorded sales in the selected period; this period has ${report.totals.transactionCount}. Record more sales or choose a longer range.`,
      });
    }

    const insightsModel = getInsightsModel();
    if (!insightsModel) {
      return apiError(503, "AI_NOT_CONFIGURED", "AI insights aren't available right now. Your sales data is unaffected.");
    }

    const quota = await consumeAiInsightQuota(supabase, workspace.barbershopId);
    if (!quota.allowed) {
      const minutes = Math.ceil(quota.retryAfterSeconds / 60);
      const res = apiError(
        429,
        "RATE_LIMITED",
        quota.scope === "user"
          ? "You're generating insights too quickly. Please wait a minute and try again."
          : `This barbershop has reached its hourly limit for AI insights. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
      res.headers.set("Retry-After", String(quota.retryAfterSeconds));
      return res;
    }

    const result = await generateInsights(report, { model: insightsModel.model });
    switch (result.kind) {
      case "ok":
        return apiSuccess({
          status: "ok" as const,
          period,
          insights: result.insights,
          transactionCount: report.totals.transactionCount,
          generatedAt: new Date().toISOString(),
          model: insightsModel.modelId,
          disclaimer: "AI suggestions are advisory. Figures shown as evidence come from your recorded sales.",
        });
      case "invalid_output":
        // Log only the kinds of problems, never the prompt or business data.
        console.warn(`[api/ai/insights] rejected model output (${result.problems.length} problem(s))`);
        return apiError(503, "AI_INVALID_OUTPUT", "The AI response couldn't be verified against your data. Please try again.");
      case "timeout":
        return apiError(503, "AI_TIMEOUT", "The AI service took too long to respond. Please try again.");
      default:
        return apiError(503, "AI_UNAVAILABLE", "The AI service is unavailable right now. Please try again shortly.");
    }
  } catch (error) {
    console.error("[api/ai/insights] unexpected error:", error instanceof Error ? error.message : "unknown");
    return apiError(500, "INTERNAL_ERROR", "Could not generate insights. Please try again.");
  }
}
