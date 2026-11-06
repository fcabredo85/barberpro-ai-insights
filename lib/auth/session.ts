import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser, type Workspace } from "@/lib/db/workspace";

/** The verified current user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  // getUser() verifies the session with Supabase Auth; never trust a decoded cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The current user's workspace, or null if they have not created one yet. */
export const getCurrentWorkspace = cache(async (): Promise<Workspace | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  return findWorkspaceForUser(supabase, user.id);
});

/** Server-side guard for private pages: redirects to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Server-side guard for workspace pages: requires a signed-in user with a
 * verified membership. Redirects to onboarding when no workspace exists.
 */
export async function requireWorkspace(): Promise<{ user: User; workspace: Workspace }> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace();
  if (!workspace) redirect("/onboarding");
  return { user, workspace };
}

/**
 * For Server Actions that change the catalog: returns the workspace only when
 * the caller is its owner, otherwise null (callers return a safe error).
 */
export async function getOwnerWorkspace(): Promise<Workspace | null> {
  const workspace = await getCurrentWorkspace();
  return workspace?.role === "owner" ? workspace : null;
}
