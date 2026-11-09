import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { finishAiJob, startAiJob } from "@/lib/db/ai-jobs";
import { PHOTO_CONSENT_NOTICE_VERSION } from "@/lib/tryon/consent";

import { createOwnerWithShop, newClient } from "./supabase-test-env";

const tryOn = (barbershopId: string, overrides: Partial<Parameters<typeof startAiJob>[1]> = {}) => ({
  barbershopId,
  feature: "tryon_preview" as const,
  requestKey: randomUUID(),
  model: "test-image-model",
  styleId: "low-taper-fade",
  consentNoticeVersion: PHOTO_CONSENT_NOTICE_VERSION,
  ...overrides,
});

describe("start_ai_job: consent gate (FR-05)", () => {
  it("refuses a try-on job without a consent notice version and records nothing", async () => {
    const { client, shop } = await createOwnerWithShop("tryon-noconsent");
    const result = await startAiJob(client, tryOn(shop.id, { consentNoticeVersion: undefined }));
    expect(result).toEqual({ allowed: false, reason: "consent_required" });
    expect((await client.from("ai_generation_jobs").select("id")).data).toEqual([]);
  });

  it("records consent (purpose, version, timestamp) together with the job", async () => {
    const { client, shop, userId } = await createOwnerWithShop("tryon-consent");
    const result = await startAiJob(client, tryOn(shop.id));
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;

    const { data: consent } = await client.from("photo_consents").select("*").eq("id", result.consentId!).single();
    expect(consent).toMatchObject({
      recorded_by: userId,
      barbershop_id: shop.id,
      purpose: "ai_hairstyle_preview",
      notice_version: PHOTO_CONSENT_NOTICE_VERSION,
      revoked_at: null,
    });
    const { data: job } = await client.from("ai_generation_jobs").select("*").eq("id", result.jobId).single();
    expect(job).toMatchObject({ consent_id: result.consentId, status: "pending", style_id: "low-taper-fade" });
  });

  it("stores no image data columns", async () => {
    const { client, shop } = await createOwnerWithShop("tryon-columns");
    await startAiJob(client, tryOn(shop.id));
    const { data } = await client.from("ai_generation_jobs").select("*").limit(1).single();
    expect(Object.keys(data!).sort()).toEqual(
      ["barbershop_id", "completed_at", "consent_id", "created_at", "duration_ms", "error_code", "feature", "id", "model", "request_key", "status", "style_id", "user_id"].sort(),
    );
  });
});

describe("start_ai_job: idempotency, concurrency and quotas (FR-09, FR-17)", () => {
  it("rejects a repeated request key", async () => {
    const { client, shop } = await createOwnerWithShop("tryon-idem");
    const requestKey = randomUUID();
    const first = await startAiJob(client, tryOn(shop.id, { requestKey }));
    expect(first.allowed).toBe(true);
    if (first.allowed) await finishAiJob(client, first.jobId, { status: "succeeded" }, 1000);
    expect(await startAiJob(client, tryOn(shop.id, { requestKey }))).toEqual({
      allowed: false,
      reason: "duplicate_request",
      status: "succeeded",
    });
  });

  it("allows only one in-flight job per user", async () => {
    const { client, shop } = await createOwnerWithShop("tryon-concurrent");
    expect((await startAiJob(client, tryOn(shop.id))).allowed).toBe(true);
    expect(await startAiJob(client, tryOn(shop.id))).toMatchObject({ allowed: false, reason: "concurrent" });
  });

  it("limits try-on previews per user per minute", async () => {
    const { client, shop } = await createOwnerWithShop("tryon-minute");
    for (let i = 0; i < 2; i++) {
      const job = await startAiJob(client, tryOn(shop.id));
      expect(job.allowed).toBe(true);
      if (job.allowed) await finishAiJob(client, job.jobId, { status: "failed", errorCode: "timeout" }, 10);
    }
    expect(await startAiJob(client, tryOn(shop.id))).toMatchObject({ allowed: false, reason: "rate_limited", scope: "user_minute" });
  });
});

describe("ai jobs and consents: access control (FR-16)", () => {
  it("refuses jobs for a barbershop the caller doesn't belong to", async () => {
    const victim = await createOwnerWithShop("tryon-victim");
    const intruder = await createOwnerWithShop("tryon-intruder");
    await expect(startAiJob(intruder.client, tryOn(victim.shop.id))).rejects.toThrow();
  });

  it("is unavailable to signed-out callers", async () => {
    const { shop } = await createOwnerWithShop("tryon-anon");
    const { error } = await newClient().rpc("start_ai_job", {
      p_barbershop_id: shop.id,
      p_feature: "tryon_preview",
      p_request_key: randomUUID(),
      p_model: "m",
      p_style_id: "low-taper-fade",
      p_consent_notice_version: PHOTO_CONSENT_NOTICE_VERSION,
    });
    expect(error?.code).toBe("42501");
  });

  it("hides other users' consents and jobs", async () => {
    const a = await createOwnerWithShop("tryon-a");
    const b = await createOwnerWithShop("tryon-b");
    await startAiJob(a.client, tryOn(a.shop.id));
    expect((await b.client.from("photo_consents").select("id")).data).toEqual([]);
    expect((await b.client.from("ai_generation_jobs").select("id")).data).toEqual([]);
  });

  it("does not let users finish someone else's job", async () => {
    const a = await createOwnerWithShop("tryon-owner");
    const b = await createOwnerWithShop("tryon-other");
    const job = await startAiJob(a.client, tryOn(a.shop.id));
    if (!job.allowed) throw new Error("expected job");
    const { data } = await b.client.rpc("finish_ai_job", { p_job_id: job.jobId, p_status: "succeeded" });
    expect(data).toBe(false);
  });

  it("blocks direct writes to consents and jobs", async () => {
    const { client, shop, userId } = await createOwnerWithShop("tryon-direct");
    const ins = await client.from("photo_consents").insert({
      barbershop_id: shop.id,
      recorded_by: userId,
      purpose: "ai_hairstyle_preview",
      notice_version: "forged",
    });
    expect(ins.error?.code).toBe("42501");
    const upd = await client.from("ai_generation_jobs").update({ status: "succeeded" }).eq("user_id", userId);
    expect(upd.error?.code).toBe("42501");
  });
});
