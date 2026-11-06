import { describe, expect, it } from "vitest";

import { renameWorkspace } from "@/lib/db/workspace";

import { TEST_PASSWORD, createOwnerWithShop, newClient, signUpUser, uniqueEmail } from "./supabase-test-env";

describe("authentication (Supabase Auth, local)", () => {
  it("signs up a new owner and returns a session", async () => {
    const client = newClient();
    const { data, error } = await client.auth.signUp({ email: uniqueEmail("signup"), password: TEST_PASSWORD });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const { error } = await newClient().auth.signUp({ email: uniqueEmail("weak"), password: "short1" });
    expect(error).not.toBeNull();
  });

  it("signs in with correct credentials and rejects a wrong password", async () => {
    const { email } = await signUpUser("signin");

    const good = await newClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
    expect(good.error).toBeNull();
    expect(good.data.user?.email).toBe(email);

    const bad = await newClient().auth.signInWithPassword({ email, password: "wrong-password-1" });
    expect(bad.error?.code).toBe("invalid_credentials");
    expect(bad.data.session).toBeNull();
  });

  it("signs out and loses access to private data", async () => {
    const { client } = await signUpUser("signout");
    await client.auth.signOut({ scope: "local" });
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
    const { error } = await client.from("barbershops").select("id");
    expect(error?.code).toBe("42501"); // anon has no table privileges
  });
});

describe("workspace creation (create_barbershop)", () => {
  it("creates the barbershop and an owner membership for the caller atomically", async () => {
    const { client, userId } = await signUpUser("creator");

    const { data: shop, error } = await client.rpc("create_barbershop", { p_name: "  Kanto Cuts  " });
    expect(error).toBeNull();
    expect(shop?.name).toBe("Kanto Cuts");
    expect(shop?.created_by).toBe(userId);

    const { data: memberships } = await client.from("memberships").select("user_id, barbershop_id, role");
    expect(memberships).toEqual([{ user_id: userId, barbershop_id: shop?.id, role: "owner" }]);
  });

  it("allows only one owned workspace per user", async () => {
    const { client } = await signUpUser("twice");
    await client.rpc("create_barbershop", { p_name: "First" });
    const { error } = await client.rpc("create_barbershop", { p_name: "Second" });
    expect(error?.code).toBe("23505");

    const { data: shops } = await client.from("barbershops").select("name");
    expect(shops).toEqual([{ name: "First" }]);
  });

  it("rejects blank and overlong names without creating anything", async () => {
    const { client } = await signUpUser("badname");
    expect((await client.rpc("create_barbershop", { p_name: "   " })).error?.code).toBe("22023");
    expect((await client.rpc("create_barbershop", { p_name: "x".repeat(101) })).error?.code).toBe("22023");
    const { data } = await client.from("memberships").select("barbershop_id");
    expect(data).toEqual([]);
  });

  it("cannot be called without signing in", async () => {
    const { error } = await newClient().rpc("create_barbershop", { p_name: "Anon Shop" });
    expect(error).not.toBeNull();
  });

  it("is the only way to create a workspace (no direct inserts)", async () => {
    const { client, userId } = await signUpUser("direct");

    const shopInsert = await client.from("barbershops").insert({ name: "Sneaky", created_by: userId });
    expect(shopInsert.error?.code).toBe("42501");
  });
});

describe("barbershop settings (renameWorkspace)", () => {
  it("lets the owner rename their own barbershop", async () => {
    const { client, shop } = await createOwnerWithShop("rename-owner");
    expect(await renameWorkspace(client, shop.id, "Kanto Cuts Annex")).toEqual({ ok: true });
    const { data } = await client.from("barbershops").select("name").eq("id", shop.id).single();
    expect(data?.name).toBe("Kanto Cuts Annex");
  });

  it("does not let another owner rename it (non-disclosing not_found)", async () => {
    const a = await createOwnerWithShop("rename-a");
    const b = await createOwnerWithShop("rename-b");
    expect(await renameWorkspace(b.client, a.shop.id, "Hijacked")).toEqual({ ok: false, reason: "not_found" });
    const { data } = await a.client.from("barbershops").select("name").eq("id", a.shop.id).single();
    expect(data?.name).toBe("rename-a Barbershop");
  });

  it("rejects a blank name at the database", async () => {
    const { client, shop } = await createOwnerWithShop("rename-blank");
    expect(await renameWorkspace(client, shop.id, "   ")).toEqual({ ok: false, reason: "invalid" });
  });
});
