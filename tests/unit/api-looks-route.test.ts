// @vitest-environment node
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOOK_STORAGE_NOTICE_VERSION } from "@/lib/tryon/consent";

import { makeJpeg, makePng } from "./tryon-test-helpers";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findWorkspaceForUser: vi.fn(),
  findSavableJob: vi.fn(),
  findLookIdForJob: vi.fn(),
  uploadLookImage: vi.fn(),
  removeLookImages: vi.fn(),
  createSavedLook: vi.fn(),
  listSavedLooks: vi.fn(),
  purgeExpiredLooks: vi.fn(),
  getSavedLook: vi.fn(),
  deleteSavedLook: vi.fn(),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/workspace", () => ({ findWorkspaceForUser: mocks.findWorkspaceForUser }));
vi.mock("@/lib/db/looks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/looks")>();
  return {
    lookObjectPaths: actual.lookObjectPaths,
    findSavableJob: mocks.findSavableJob,
    findLookIdForJob: mocks.findLookIdForJob,
    uploadLookImage: mocks.uploadLookImage,
    removeLookImages: mocks.removeLookImages,
    createSavedLook: mocks.createSavedLook,
    listSavedLooks: mocks.listSavedLooks,
    purgeExpiredLooks: mocks.purgeExpiredLooks,
    getSavedLook: mocks.getSavedLook,
    deleteSavedLook: mocks.deleteSavedLook,
  };
});

import { DELETE } from "@/app/api/looks/[id]/route";
import { GET, POST } from "@/app/api/looks/route";

const SHOP_ID = randomUUID();
const JOB_ID = randomUUID();

function buildForm(overrides: Record<string, string | Blob | null> = {}) {
  const form = new FormData();
  const values: Record<string, string | Blob | null> = {
    original: new Blob([makeJpeg(1024, 1280) as BlobPart], { type: "image/jpeg" }),
    preview: new Blob([makePng(1024, 1024) as BlobPart], { type: "image/png" }),
    tryOnJobId: JOB_ID,
    customerLabel: "Juan Dela Cruz",
    title: "For Saturday",
    storageConsent: "granted",
    storageNoticeVersion: LOOK_STORAGE_NOTICE_VERSION,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === null) continue;
    if (value instanceof Blob) form.set(key, value, key);
    else form.set(key, value);
  }
  return form;
}

async function post(form: FormData = buildForm(), withLength = true) {
  const draft = new Request("http://localhost/api/looks", { method: "POST", body: form });
  const body = new Uint8Array(await draft.arrayBuffer());
  const headers: Record<string, string> = { "content-type": draft.headers.get("content-type")! };
  if (withLength) headers["content-length"] = String(body.byteLength);
  return POST(new Request("http://localhost/api/looks", { method: "POST", body, headers }));
}

const del = (id: string) => DELETE(new Request(`http://localhost/api/looks/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.findWorkspaceForUser.mockResolvedValue({ barbershopId: SHOP_ID, name: "Shop", role: "manager" });
  mocks.findSavableJob.mockResolvedValue({ id: JOB_ID, style_id: "low-taper-fade" });
  mocks.findLookIdForJob.mockResolvedValue(null);
  mocks.uploadLookImage.mockResolvedValue(undefined);
  mocks.removeLookImages.mockResolvedValue(true);
  mocks.createSavedLook.mockImplementation(async (_db, input) => ({ ok: true, lookId: input.lookId, duplicate: false }));
  mocks.purgeExpiredLooks.mockResolvedValue(0);
  mocks.listSavedLooks.mockResolvedValue([]);
});

describe("POST /api/looks: access and input", () => {
  it("returns 401 when signed out, before touching storage", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await post()).status).toBe(401);
    expect(mocks.uploadLookImage).not.toHaveBeenCalled();
  });

  it("returns 403 without a workspace", async () => {
    mocks.findWorkspaceForUser.mockResolvedValue(null);
    expect((await post()).status).toBe(403);
  });

  it("returns 411 without Content-Length", async () => {
    expect((await post(buildForm(), false)).status).toBe(411);
  });

  it.each([
    ["no storage consent", { storageConsent: null }],
    ["an outdated storage notice", { storageNoticeVersion: "old" }],
  ])("requires storage consent: %s", async (_label, overrides) => {
    const res = await post(buildForm(overrides));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CONSENT_REQUIRED");
    expect(mocks.uploadLookImage).not.toHaveBeenCalled();
  });

  it("requires a customer name", async () => {
    const res = await post(buildForm({ customerLabel: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.customerLabel).toBeDefined();
  });

  it("rejects a preview that isn't the caller's successful job", async () => {
    mocks.findSavableJob.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_SELECTION");
    expect(mocks.uploadLookImage).not.toHaveBeenCalled();
  });

  it.each([
    ["a fake original", { original: new Blob(["<svg/>"], { type: "image/jpeg" }) }],
    ["a missing preview", { preview: null }],
  ])("rejects %s without uploading", async (_label, overrides) => {
    const res = await post(buildForm(overrides));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UPLOAD");
    expect(mocks.uploadLookImage).not.toHaveBeenCalled();
  });
});

describe("POST /api/looks: saving", () => {
  it("uploads both images under the shop's folder and records the look", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toEqual({ lookId: expect.any(String), duplicate: false });

    const paths = mocks.uploadLookImage.mock.calls.map((c) => c[1]);
    expect(paths).toEqual([`${SHOP_ID}/${data.lookId}/original.jpg`, `${SHOP_ID}/${data.lookId}/preview.png`]);
    expect(mocks.createSavedLook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ barbershopId: SHOP_ID, tryOnJobId: JOB_ID, customerLabel: "Juan Dela Cruz", noticeVersion: LOOK_STORAGE_NOTICE_VERSION }),
    );
  });

  it("is idempotent: an already-saved preview returns the existing look without uploading", async () => {
    const existing = randomUUID();
    mocks.findLookIdForJob.mockResolvedValue(existing);
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ lookId: existing, duplicate: true });
    expect(mocks.uploadLookImage).not.toHaveBeenCalled();
  });

  it("cleans up uploaded objects when storage fails midway", async () => {
    mocks.uploadLookImage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("storage down"));
    const res = await post();
    expect(res.status).toBe(503);
    expect(mocks.removeLookImages).toHaveBeenCalledWith(expect.anything(), [expect.stringContaining("/original.jpg"), expect.stringContaining("/preview.png")]);
    expect(mocks.createSavedLook).not.toHaveBeenCalled();
  });

  it("cleans up objects when the database rejects the save", async () => {
    mocks.createSavedLook.mockResolvedValue({ ok: false, reason: "invalid_job" });
    expect((await post()).status).toBe(400);
    expect(mocks.removeLookImages).toHaveBeenCalled();
  });

  it("cleans up objects and returns a safe 500 when the database errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSavedLook.mockRejectedValue(new Error("connection to 10.0.0.9 refused"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("10.0.0.9");
    expect(mocks.removeLookImages).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("drops its own copies when a concurrent request saved first", async () => {
    const winner = randomUUID();
    mocks.createSavedLook.mockResolvedValue({ ok: true, lookId: winner, duplicate: true });
    const res = await post();
    expect((await res.json()).data).toEqual({ lookId: winner, duplicate: true });
    expect(mocks.removeLookImages).toHaveBeenCalled();
  });
});

describe("GET /api/looks", () => {
  it("purges expired looks, then lists the shop's looks without caching", async () => {
    mocks.listSavedLooks.mockResolvedValue([{ id: "a" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(mocks.purgeExpiredLooks).toHaveBeenCalledWith(expect.anything(), SHOP_ID);
    expect(mocks.listSavedLooks).toHaveBeenCalledWith(expect.anything(), SHOP_ID);
  });

  it("returns 401 when signed out", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
  });
});

describe("DELETE /api/looks/:id (FR-15)", () => {
  const look = { id: randomUUID(), original_path: "a/b/original.jpg", preview_path: "a/b/preview.png" };

  it("deletes photos and record", async () => {
    mocks.getSavedLook.mockResolvedValue(look);
    mocks.deleteSavedLook.mockResolvedValue("deleted");
    const res = await del(look.id);
    expect(res.status).toBe(200);
    expect(mocks.deleteSavedLook).toHaveBeenCalledWith(expect.anything(), look);
  });

  it("returns a non-disclosing 404 for another shop's or a missing look", async () => {
    mocks.getSavedLook.mockResolvedValue(null);
    expect((await del(randomUUID())).status).toBe(404);
    expect(mocks.deleteSavedLook).not.toHaveBeenCalled();
  });

  it("returns 503 and keeps the record when photos can't be removed", async () => {
    mocks.getSavedLook.mockResolvedValue(look);
    mocks.deleteSavedLook.mockResolvedValue("storage_error");
    expect((await del(look.id)).status).toBe(503);
  });

  it("rejects malformed ids and signed-out callers", async () => {
    expect((await del("../../etc")).status).toBe(400);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await del(randomUUID())).status).toBe(401);
  });
});
