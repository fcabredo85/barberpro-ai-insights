import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { finishAiJob, startAiJob } from "@/lib/db/ai-jobs";
import {
  LOOKS_BUCKET,
  createSavedLook,
  deleteSavedLook,
  getSavedLook,
  listSavedLooks,
  lookObjectPaths,
  uploadLookImage,
} from "@/lib/db/looks";
import { LOOK_STORAGE_NOTICE_VERSION, PHOTO_CONSENT_NOTICE_VERSION } from "@/lib/tryon/consent";

import { makeJpeg, makePng } from "../unit/tryon-test-helpers";
import { createOwnerWithShop, type TestClient } from "./supabase-test-env";

async function succeededJob(client: TestClient, shopId: string, styleId = "pompadour") {
  const job = await startAiJob(client, {
    barbershopId: shopId,
    feature: "tryon_preview",
    requestKey: randomUUID(),
    model: "test-image-model",
    styleId,
    consentNoticeVersion: PHOTO_CONSENT_NOTICE_VERSION,
  });
  if (!job.allowed) throw new Error(`job not allowed: ${JSON.stringify(job)}`);
  await finishAiJob(client, job.jobId, { status: "succeeded" }, 1234);
  return job.jobId;
}

async function saveLook(client: TestClient, shopId: string) {
  const jobId = await succeededJob(client, shopId);
  const lookId = randomUUID();
  const paths = lookObjectPaths(shopId, lookId, "image/jpeg", "image/png");
  await uploadLookImage(client, paths.originalPath, makeJpeg(800, 1000), "image/jpeg");
  await uploadLookImage(client, paths.previewPath, makePng(800, 1000), "image/png");
  const result = await createSavedLook(client, {
    lookId,
    barbershopId: shopId,
    tryOnJobId: jobId,
    customerLabel: "Juan",
    title: "Next visit",
    ...paths,
    noticeVersion: LOOK_STORAGE_NOTICE_VERSION,
  });
  return { jobId, lookId, paths, result };
}

describe("saved looks: persistence (FR-13)", () => {
  it("saves a look with the server-recorded style, a storage consent and a retention date", async () => {
    const owner = await createOwnerWithShop("looks-save");
    const { lookId, result } = await saveLook(owner.client, owner.shop.id);
    expect(result).toEqual({ ok: true, lookId, duplicate: false });

    const { data: row } = await owner.client.from("saved_looks").select("*").eq("id", lookId).single();
    expect(row).toMatchObject({ style_id: "pompadour", customer_label: "Juan", title: "Next visit", created_by: owner.userId });
    const days = (Date.parse(row!.delete_after) - Date.parse(row!.created_at)) / 86_400_000;
    expect(Math.round(days)).toBe(90);

    const { data: consent } = await owner.client.from("photo_consents").select("*").eq("id", row!.storage_consent_id).single();
    expect(consent).toMatchObject({ purpose: "look_storage", notice_version: LOOK_STORAGE_NOTICE_VERSION, revoked_at: null });
  });

  it("lists looks with working short-lived signed URLs", async () => {
    const owner = await createOwnerWithShop("looks-list");
    const { lookId } = await saveLook(owner.client, owner.shop.id);
    const looks = await listSavedLooks(owner.client, owner.shop.id);
    expect(looks.map((l) => l.id)).toEqual([lookId]);
    expect(looks[0]).toMatchObject({ styleName: "Pompadour", customerLabel: "Juan" });
    const res = await fetch(looks[0]!.previewUrl!);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(makePng(800, 1000));
  });

  it("is idempotent per preview: saving it again returns the original look", async () => {
    const owner = await createOwnerWithShop("looks-dup");
    const { jobId, lookId } = await saveLook(owner.client, owner.shop.id);
    const secondId = randomUUID();
    const again = await createSavedLook(owner.client, {
      lookId: secondId,
      barbershopId: owner.shop.id,
      tryOnJobId: jobId,
      customerLabel: "Juan",
      ...lookObjectPaths(owner.shop.id, secondId, "image/jpeg", "image/png"),
      noticeVersion: LOOK_STORAGE_NOTICE_VERSION,
    });
    expect(again).toEqual({ ok: true, lookId, duplicate: true });
    expect((await owner.client.from("saved_looks").select("id")).data).toHaveLength(1);
  });

  it("rejects object paths outside the look's own folder", async () => {
    const owner = await createOwnerWithShop("looks-path");
    const jobId = await succeededJob(owner.client, owner.shop.id);
    const lookId = randomUUID();
    await expect(
      createSavedLook(owner.client, {
        lookId,
        barbershopId: owner.shop.id,
        tryOnJobId: jobId,
        customerLabel: "Juan",
        ...lookObjectPaths(owner.shop.id, randomUUID(), "image/jpeg", "image/png"),
        noticeVersion: LOOK_STORAGE_NOTICE_VERSION,
      }),
    ).rejects.toThrow(/Failed to save look/);
  });

  it("refuses to save a preview from a failed or foreign job", async () => {
    const a = await createOwnerWithShop("looks-job-a");
    const b = await createOwnerWithShop("looks-job-b");
    const foreignJob = await succeededJob(a.client, a.shop.id);
    const lookId = randomUUID();
    const result = await createSavedLook(b.client, {
      lookId,
      barbershopId: b.shop.id,
      tryOnJobId: foreignJob,
      customerLabel: "X",
      ...lookObjectPaths(b.shop.id, lookId, "image/jpeg", "image/png"),
      noticeVersion: LOOK_STORAGE_NOTICE_VERSION,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_job" });
  });
});

describe("saved looks: cross-shop isolation (FR-16)", () => {
  it("hides records and photos from another barbershop", async () => {
    const victim = await createOwnerWithShop("looks-victim");
    const intruder = await createOwnerWithShop("looks-intruder");
    const { lookId, paths } = await saveLook(victim.client, victim.shop.id);

    expect(await getSavedLook(intruder.client, lookId)).toBeNull();
    expect(await listSavedLooks(intruder.client, victim.shop.id)).toEqual([]);

    const download = await intruder.client.storage.from(LOOKS_BUCKET).download(paths.originalPath);
    expect(download.data).toBeNull();
    const signed = await intruder.client.storage.from(LOOKS_BUCKET).createSignedUrl(paths.originalPath, 60);
    expect(signed.data).toBeNull();
  });

  it("blocks uploads into another shop's folder and malformed paths", async () => {
    const victim = await createOwnerWithShop("looks-upload-victim");
    const intruder = await createOwnerWithShop("looks-upload-intruder");
    await expect(
      uploadLookImage(intruder.client, `${victim.shop.id}/${randomUUID()}/original.jpg`, makeJpeg(800, 800), "image/jpeg"),
    ).rejects.toThrow();
    await expect(uploadLookImage(intruder.client, `not-a-uuid/x/original.jpg`, makeJpeg(800, 800), "image/jpeg")).rejects.toThrow();
  });

  it("does not let another shop delete photos or records", async () => {
    const victim = await createOwnerWithShop("looks-del-victim");
    const intruder = await createOwnerWithShop("looks-del-intruder");
    const { lookId, paths } = await saveLook(victim.client, victim.shop.id);

    await intruder.client.storage.from(LOOKS_BUCKET).remove([paths.originalPath, paths.previewPath]);
    const { data: deleted } = await intruder.client.rpc("delete_saved_look", { p_look_id: lookId });
    expect(deleted).toBe(false);

    const stillThere = await victim.client.storage.from(LOOKS_BUCKET).download(paths.originalPath);
    expect(stillThere.data).not.toBeNull();
    expect(await getSavedLook(victim.client, lookId)).not.toBeNull();
  });

  it("blocks direct writes to saved_looks", async () => {
    const owner = await createOwnerWithShop("looks-direct");
    const { lookId } = await saveLook(owner.client, owner.shop.id);
    const upd = await owner.client.from("saved_looks").update({ customer_label: "forged" }).eq("id", lookId);
    expect(upd.error?.code).toBe("42501");
  });
});

describe("saved looks: deletion (FR-15)", () => {
  it("removes both photos and the record, and marks the storage consent revoked", async () => {
    const owner = await createOwnerWithShop("looks-delete");
    const { lookId, paths } = await saveLook(owner.client, owner.shop.id);
    const { data: before } = await owner.client.from("saved_looks").select("storage_consent_id").eq("id", lookId).single();

    const look = await getSavedLook(owner.client, lookId);
    expect(await deleteSavedLook(owner.client, look!)).toBe("deleted");

    expect(await getSavedLook(owner.client, lookId)).toBeNull();
    for (const path of [paths.originalPath, paths.previewPath]) {
      const { data } = await owner.client.storage.from(LOOKS_BUCKET).download(path);
      expect(data).toBeNull();
    }
    const { data: consent } = await owner.client.from("photo_consents").select("revoked_at").eq("id", before!.storage_consent_id).single();
    expect(consent!.revoked_at).not.toBeNull();
  });
});
