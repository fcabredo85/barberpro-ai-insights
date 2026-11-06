import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

export type TestClient = SupabaseClient<Database>;

interface TestEnv {
  url: string;
  anonKey: string;
}

let cached: TestEnv | undefined;

/**
 * Resolve the LOCAL test database. Uses SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY
 * when set, otherwise asks the Supabase CLI. Only the anon key is used: tests
 * exercise the database exactly as the app does, through RLS.
 */
export function getTestEnv(): TestEnv {
  if (cached) return cached;

  let url = process.env.SUPABASE_TEST_URL;
  let anonKey = process.env.SUPABASE_TEST_ANON_KEY;

  if (!url || !anonKey) {
    let output: string;
    try {
      output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      throw new Error(
        "Local Supabase is not running. Start it with `npx supabase start` (requires Docker), " +
          "or set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY.",
      );
    }
    const vars = Object.fromEntries(
      output
        .split("\n")
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );
    url ??= vars.API_URL;
    anonKey ??= vars.ANON_KEY;
  }

  if (!url || !anonKey) throw new Error("Could not resolve local Supabase URL and anon key.");

  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host) && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
    throw new Error(`Refusing to run integration tests against non-local host ${host}.`);
  }

  cached = { url, anonKey };
  return cached;
}

export function newClient(): TestClient {
  const { url, anonKey } = getTestEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const TEST_PASSWORD = "Test-password-123";

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.com`;
}

/** Sign up a fresh user (local Auth has email confirmation disabled). */
export async function signUpUser(label: string): Promise<{ client: TestClient; userId: string; email: string }> {
  const client = newClient();
  const email = uniqueEmail(label);
  const { data, error } = await client.auth.signUp({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.session || !data.user) throw new Error("signUp returned no session; is email confirmation enabled?");
  return { client, userId: data.user.id, email };
}

/** Sign up a user and create their workspace through the authorized RPC. */
export async function createOwnerWithShop(label: string) {
  const user = await signUpUser(label);
  const { data: shop, error } = await user.client.rpc("create_barbershop", { p_name: `${label} Barbershop` });
  if (error || !shop) throw new Error(`create_barbershop failed: ${error?.message}`);
  return { ...user, shop };
}
