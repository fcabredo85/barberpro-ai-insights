// @vitest-environment node
import { randomUUID } from "node:crypto";

import { APICallError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PHOTO_CONSENT_NOTICE_VERSION } from "@/lib/tryon/consent";
import { MAX_UPLOAD_BYTES } from "@/lib/tryon/image-validation";

import { TINY_PNG_BASE64, makeJpeg, makePng, mockImageModel, type ImageReply } from "./tryon-test-helpers";

const FAKE_KEY = "sk-test-should-never-appear-0123456789";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  startAiJob: vi.fn(),
  finishAiJob: vi.fn(),
  getTryOnImageModel: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/db/ai-jobs", () => ({ startAiJob: mocks.startAiJob, finishAiJob: mocks.finishAiJob }));
vi.mock("@/lib/ai/image-model", () => ({ getTryOnImageModel: mocks.getTryOnImageModel }));

import { POST } from "@/app/api/try-on/route";

const SHOP_ID = randomUUID();
const JOB_ID = randomUUID();

interface FormOptions {
  photo?: Blob | null;
  photoType?: string;
  styleId?: string | null;
  consent?: string | null;
  consentNoticeVersion?: string | null;
  requestKey?: string | null;
}

function buildForm(opts: FormOptions = {}): FormData {
  const form = new FormData();
  const photo = opts.photo === undefined ? new Blob([makeJpeg(1080, 1350) as BlobPart], { type: opts.photoType ?? "image/jpeg" }) : opts.photo;
  if (photo) form.set("photo", photo, "selfie.jpg");
  const fields: Record<string, string | null | undefined> = {
    styleId: opts.styleId === undefined ? "low-taper-fade" : opts.styleId,
    consent: opts.consent === undefined ? "granted" : opts.consent,
    consentNoticeVersion: opts.consentNoticeVersion === undefined ? PHOTO_CONSENT_NOTICE_VERSION : opts.consentNoticeVersion,
    requestKey: opts.requestKey === undefined ? randomUUID() : opts.requestKey,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== null && value !== undefined) form.set(key, value);
  return form;
}

/** Serialize like a browser does: multipart body with an explicit Content-Length. */
async function toRequest(form: FormData | string, headers: Record<string, string>, withLength: boolean) {
  const draft =
    typeof form === "string"
      ? new Request("http://localhost/api/try-on", { method: "POST", body: form, headers: { "content-type": "application/json" } })
      : new Request("http://localhost/api/try-on", { method: "POST", body: form });
  const body = new Uint8Array(await draft.arrayBuffer());
  const finalHeaders: Record<string, string> = { "content-type": draft.headers.get("content-type")!, ...headers };
  if (withLength && !("content-length" in headers)) finalHeaders["content-length"] = String(body.byteLength);
  return new Request("http://localhost/api/try-on", { method: "POST", body, headers: finalHeaders });
}

async function post(form: FormData | string = buildForm(), headers: Record<string, string> = {}, withLength = true) {
  return POST(await toRequest(form, headers, withLength));
}

function useImageModel(reply?: ImageReply) {
  const mock = mockImageModel(reply);
  mocks.getTryOnImageModel.mockReturnValue({ model: mock.model, modelId: "mock-image-model" });
  return mock;
}

let model: ReturnType<typeof mockImageModel>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = FAKE_KEY;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: SHOP_ID, name: "Shop", role: "manager" });
  mocks.startAiJob.mockResolvedValue({ allowed: true, jobId: JOB_ID, consentId: randomUUID() });
  mocks.finishAiJob.mockResolvedValue(undefined);
  model = useImageModel();
});

describe("POST /api/try-on: access control", () => {
  it("returns 401 when signed out and never calls the provider", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await post();
    expect(res.status).toBe(401);
    expect(mocks.startAiJob).not.toHaveBeenCalled();
    expect(model.calls).toHaveLength(0);
  });

  it("returns 403 without a barbershop membership", async () => {
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    expect((await post()).status).toBe(403);
    expect(model.calls).toHaveLength(0);
  });

  it("allows non-owner members (staff consultations)", async () => {
    expect((await post()).status).toBe(200);
  });

  it("scopes the job to the caller's own barbershop", async () => {
    await post();
    expect(mocks.startAiJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ barbershopId: SHOP_ID, feature: "tryon_preview" }));
  });
});

describe("POST /api/try-on: consent gate (FR-05)", () => {
  it.each([
    ["no consent field (unchecked box)", { consent: null }],
    ["a non-affirmative value", { consent: "true" }],
    ["an outdated notice version", { consentNoticeVersion: "2020-01-01" }],
    ["a missing notice version", { consentNoticeVersion: null }],
  ])("rejects %s with 400 CONSENT_REQUIRED and no provider call", async (_label, opts) => {
    const res = await post(buildForm(opts));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CONSENT_REQUIRED");
    expect(mocks.startAiJob).not.toHaveBeenCalled();
    expect(model.calls).toHaveLength(0);
  });

  it("records consent (via the job gate) before calling the provider", async () => {
    const order: string[] = [];
    mocks.startAiJob.mockImplementation(async () => {
      order.push("consent+job recorded");
      return { allowed: true, jobId: JOB_ID, consentId: randomUUID() };
    });
    const { MockImageModelV4 } = await import("ai/test");
    mocks.getTryOnImageModel.mockReturnValue({
      modelId: "m",
      model: new MockImageModelV4({
        doGenerate: async () => {
          order.push("provider called");
          return { images: [TINY_PNG_BASE64], warnings: [], response: { timestamp: new Date(), modelId: "m", headers: undefined } };
        },
      }),
    });
    await post();
    expect(order).toEqual(["consent+job recorded", "provider called"]);
    expect(mocks.startAiJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ consentNoticeVersion: PHOTO_CONSENT_NOTICE_VERSION }),
    );
  });

  it("does not call the provider when the database refuses consent", async () => {
    mocks.startAiJob.mockResolvedValue({ allowed: false, reason: "consent_required" });
    const res = await post();
    expect(res.status).toBe(400);
    expect(model.calls).toHaveLength(0);
  });
});

describe("POST /api/try-on: input validation (FR-03, FR-04)", () => {
  it("returns 415 for non-multipart requests", async () => {
    expect((await post("{}")).status).toBe(415);
  });

  it("returns 411 when the body size isn't declared, before reading it", async () => {
    const res = await post(buildForm(), {}, false);
    expect(res.status).toBe(411);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("returns 413 from Content-Length before reading the body", async () => {
    const res = await post(buildForm(), { "content-length": String(MAX_UPLOAD_BYTES * 2) });
    expect(res.status).toBe(413);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("returns 413 for a photo over 8 MB", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 10);
    big.set(makeJpeg(1000, 1000));
    const res = await post(buildForm({ photo: new Blob([big as BlobPart], { type: "image/jpeg" }) }));
    expect(res.status).toBe(413);
    expect(model.calls).toHaveLength(0);
  });

  it.each([
    ["a missing photo", { photo: null }],
    ["a mismatched signature", { photo: new Blob([makePng(800, 800) as BlobPart], { type: "image/jpeg" }) }],
    ["a corrupt image", { photo: new Blob([makeJpeg(800, 800, { truncated: true }) as BlobPart], { type: "image/jpeg" }) }],
    ["an oversized-dimension image", { photo: new Blob([makePng(9000, 9000) as BlobPart], { type: "image/png" }) }],
    ["an SVG", { photo: new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" }) }],
  ])("rejects %s with 400 INVALID_UPLOAD", async (_label, opts) => {
    const res = await post(buildForm(opts));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UPLOAD");
    expect(model.calls).toHaveLength(0);
  });

  it.each([
    ["an unknown style", { styleId: "mullet" }],
    ["a missing style", { styleId: null }],
    ["a style display name instead of an ID", { styleId: "Low Taper Fade" }],
    ["a bad request key", { requestKey: "not-a-uuid" }],
  ])("rejects %s with 400", async (_label, opts) => {
    const res = await post(buildForm(opts));
    expect(res.status).toBe(400);
    expect(mocks.startAiJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/try-on: quotas and idempotency (FR-09, FR-17)", () => {
  it("returns 429 with Retry-After when rate limited, without calling the provider", async () => {
    mocks.startAiJob.mockResolvedValue({ allowed: false, reason: "rate_limited", scope: "user_day", retryAfterSeconds: 3600 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await res.json()).error.message).toMatch(/today's preview limit/);
    expect(model.calls).toHaveLength(0);
  });

  it("returns 429 while another preview is in flight", async () => {
    mocks.startAiJob.mockResolvedValue({ allowed: false, reason: "concurrent", retryAfterSeconds: 15 });
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/already being generated/);
  });

  it("returns 409 for a repeated request key (no double charge)", async () => {
    mocks.startAiJob.mockResolvedValue({ allowed: false, reason: "duplicate_request", status: "succeeded" });
    expect((await post()).status).toBe(409);
    expect(model.calls).toHaveLength(0);
  });
});

describe("POST /api/try-on: generation (FR-07, FR-11, FR-18)", () => {
  it("returns the real preview, labeled as an AI simulation, with no-store caching", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const { data } = await res.json();
    expect(data).toMatchObject({
      status: "ok",
      jobId: JOB_ID,
      styleId: "low-taper-fade",
      styleName: "Low Taper Fade",
      label: "AI-generated simulation",
      preview: { dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}`, mediaType: "image/png" },
    });
    expect(data.disclaimer).toMatch(/not guaranteed/);
    expect(mocks.finishAiJob).toHaveBeenCalledWith(expect.anything(), JOB_ID, { status: "succeeded" }, expect.any(Number));
  });

  it("returns 503 AI_NOT_CONFIGURED when the key or model is missing, before recording a job", async () => {
    mocks.getTryOnImageModel.mockReturnValue(null);
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("AI_NOT_CONFIGURED");
    expect(mocks.startAiJob).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a safety refusal",
      new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 400, responseBody: '{"error":{"code":"moderation_blocked"}}' }),
      422,
      "AI_REFUSED",
    ],
    ["a provider rate limit", new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 429, isRetryable: false }), 503, "AI_UNAVAILABLE"],
    ["a provider outage", new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 500, isRetryable: false }), 502, "AI_UNAVAILABLE"],
    ["a malformed response", { images: [] }, 502, "AI_INVALID_OUTPUT"],
  ] as const)("handles %s safely without a fake image", async (_label, reply, status, code) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useImageModel(reply as ImageReply);
    const res = await post();
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/moderation_blocked|base64/);
    expect(mocks.finishAiJob).toHaveBeenCalledWith(expect.anything(), JOB_ID, expect.objectContaining({ status: "failed" }), expect.any(Number));
    // Logs carry only the category and job id: never image data.
    for (const call of warn.mock.calls) expect(String(call.join(" "))).not.toMatch(/data:|base64|\/9j\//);
    warn.mockRestore();
  });

  it("never exposes the API key", async () => {
    const res = await post();
    expect(await res.text()).not.toContain(FAKE_KEY);
  });

  it("returns a safe 500 when something unexpected throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.startAiJob.mockRejectedValue(new Error("connection to 10.9.8.7 refused"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("10.9.8.7");
    spy.mockRestore();
  });
});
