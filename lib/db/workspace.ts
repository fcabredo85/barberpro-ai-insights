import "server-only";

import type { SupabaseServerClient } from "@/lib/db/supabase/server";
import type { Database } from "@/lib/db/database.types";

export type MembershipRole = Database["public"]["Enums"]["membership_role"];

export interface Workspace {
  barbershopId: string;
  name: string;
  role: MembershipRole;
}

/**
 * The caller's workspace, resolved from their membership (never from a
 * client-supplied barbershop id). RLS restricts memberships to the caller's
 * own rows; the explicit user filter keeps the query intent obvious.
 */
export async function findWorkspaceForUser(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("barbershop_id, role, barbershops ( name )")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Log only the error code and its hint, never tokens or request bodies.
    // PGRST205 ("table not found") means migrations have not been applied.
    const hint =
      error.code === "PGRST205"
        ? " Database schema is missing: apply supabase/migrations (see supabase/README.md)."
        : "";
    console.error(`[workspace] membership lookup failed (code ${error.code ?? "unknown"}).${hint}`);
    throw new Error("Failed to load workspace membership", { cause: error.code });
  }
  if (!data || !data.barbershops) return null;

  return { barbershopId: data.barbershop_id, name: data.barbershops.name, role: data.role };
}

/** Creates the barbershop and the caller's owner membership in one transaction. */
export async function createWorkspace(supabase: SupabaseServerClient, name: string) {
  return supabase.rpc("create_barbershop", { p_name: name });
}
