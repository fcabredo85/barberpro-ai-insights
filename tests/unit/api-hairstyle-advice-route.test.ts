// @vitest-environment node
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockModel } from "./ai-test-helpers";
import { validAdvice } from "./tryon-test-helpers";

const FAKE_KEY = "sk-test-should-never-appear-0123456789";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  startAiJob: vi.fn(),
  finishAiJob: vi.fn(),
  getInsightsModel: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/db/ai-jobs", () => ({ startAiJob: mocks.startAiJob, finishAiJob: mocks.finishAiJob }));
vi.mock("@/lib/ai/model", () => ({ getInsightsModel: mocks.getInsightsModel }));

import { POST } from "@/app/api/hairstyle-advice/route";

const PREFS = { lengthOnTop: "short", maintenance: "low", hairTexture: "straight", vibe: "sporty" };
const JOB_ID = randomUUID();

function post(payload: unknown, contentType = "application/json") {
  return POST(
    new Request("http://localhost/api/hairstyle-advice", {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

const body = () => ({ preferences: PREFS, requestKey: randomUUID() });

function useModel(...replies: Parameters<typeof mockModel>) {
  const mock = mockModel(...replies);
  mocks.getInsightsModel.mockReturnValue({ model: mock.model, modelId: "mock-model" });
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = FAKE_KEY;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: randomUUID(), name: "Shop", role: "owner" });
  mocks.startAiJob.mockResolvedValue({ allowed: true, jobId: JOB_ID, consentId: null });
  useModel(JSON.stringify(validAdvice()));
});

describe("POST /api/hairstyle-advice", () => {
  it("returns 401 when signed out", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await post(body())).status).toBe(401);
    expect(mocks.startAiJob).not.toHaveBeenCalled();
  });

  it("returns 403 without a workspace", async () => {
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    expect((await post(body())).status).toBe(403);
  });

  it("returns 415 for non-JSON and 400 for bad input", async () => {
    expect((await post("x=1", "text/plain")).status).toBe(415);
    expect((await post("{oops")).status).toBe(400);
    expect((await post({ preferences: { ...PREFS, notes: "free text" }, requestKey: randomUUID() })).status).toBe(400);
    expect(mocks.startAiJob).not.toHaveBeenCalled();
  });

  it("returns 3-5 validated recommendations with names and a disclaimer", async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.recommendations).toHaveLength(3);
    expect(data.recommendations[0]).toEqual({ styleId: "buzz-cut", styleName: "Buzz Cut", reason: expect.any(String) });
    expect(data.disclaimer).toMatch(/barber will confirm/);
    expect(mocks.startAiJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ feature: "hairstyle_advice" }));
    expect(mocks.finishAiJob).toHaveBeenCalledWith(expect.anything(), JOB_ID, { status: "succeeded" }, expect.any(Number));
  });

  it("returns 429 with Retry-After when rate limited, without calling the model", async () => {
    const { calls } = useModel(JSON.stringify(validAdvice()));
    mocks.startAiJob.mockResolvedValue({ allowed: false, reason: "rate_limited", scope: "user_minute", retryAfterSeconds: 30 });
    const res = await post(body());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(calls).toHaveLength(0);
  });

  it("returns 503 when AI is not configured", async () => {
    mocks.getInsightsModel.mockReturnValue(null);
    const res = await post(body());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns 503 when the model output fails validation, and records the failure", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    useModel('{"recommendations":[]}', "nope");
    const res = await post(body());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_INVALID_OUTPUT");
    expect(mocks.finishAiJob).toHaveBeenCalledWith(expect.anything(), JOB_ID, { status: "failed", errorCode: "invalid_output" }, expect.any(Number));
    spy.mockRestore();
  });

  it("never exposes the API key", async () => {
    expect(await (await post(body())).text()).not.toContain(FAKE_KEY);
  });
});
