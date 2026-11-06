import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiInsightsPanel } from "@/components/dashboard/ai-insights-panel";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const insights = [1, 2, 3].map((n) => ({
  title: `Insight ${n} title`,
  observation: `Observation number ${n} about the shop's sales.`,
  evidence: `Fact ${n}: ₱${n}00.00`,
  evidenceFacts: [{ label: `Fact ${n}`, value: `₱${n}00.00` }],
  action: `Action number ${n} for the owner to try.`,
}));

const props = { from: "2026-10-31", to: "2026-11-06", transactionCount: 12, minTransactions: 5 };

describe("AiInsightsPanel", () => {
  it("explains insufficient data up front and doesn't call the API", () => {
    render(<AiInsightsPanel {...props} transactionCount={2} />);
    expect(screen.getByText(/at least 5 recorded sales/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate insights" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests insights for the selected range and shows three with evidence and actions", async () => {
    fetchMock.mockResolvedValue(
      json(200, { data: { status: "ok", insights, generatedAt: "2026-11-06T04:00:00Z", disclaimer: "AI suggestions are advisory." } }),
    );
    render(<AiInsightsPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));

    expect(await screen.findByText("Insight 1 title")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("₱300.00")).toBeInTheDocument();
    expect(screen.getByText("Action number 2 for the owner to try.")).toBeInTheDocument();
    expect(screen.getByText(/AI suggestion · generated/)).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ from: "2026-10-31", to: "2026-11-06" });
  });

  it("shows a retryable error state when the AI fails", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: { code: "AI_UNAVAILABLE", message: "The AI service is unavailable right now." } }));
    fetchMock.mockResolvedValueOnce(json(200, { data: { status: "ok", insights, generatedAt: "2026-11-06T04:00:00Z", disclaimer: "" } }));
    render(<AiInsightsPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Insight 3 title")).toBeInTheDocument();
  });

  it("disables retry during a rate-limit wait", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { code: "RATE_LIMITED", message: "Please wait a minute." } }, { "Retry-After": "45" }));
    render(<AiInsightsPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    const retry = await screen.findByRole("button", { name: /Try again in \d+s/ });
    expect(retry).toBeDisabled();
  });

  it("shows the server's insufficient-data message", async () => {
    fetchMock.mockResolvedValue(json(200, { data: { status: "insufficient_data", insights: [], message: "AI insights need at least 5 recorded sales." } }));
    render(<AiInsightsPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    await waitFor(() => expect(screen.getByText("AI insights need at least 5 recorded sales.")).toBeInTheDocument());
  });
});
