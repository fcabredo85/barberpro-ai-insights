import "server-only";

import type { User } from "@supabase/supabase-js";

import { apiError } from "@/lib/api/response";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/db/supabase/server";
import { findWorkspaceForUser, type Workspace } from "@/lib/db/workspace";

export type WorkspaceAuth =
  | { ok: true; supabase: SupabaseServerClient; user: User; workspace: Workspace }
  | { ok: false; response: Response };

/** Route-handler guard: verified user with a barbershop membership, else 401/403. */
export async function authorizeWorkspace(action: string): Promise<WorkspaceAuth> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError(401, "UNAUTHENTICATED", `Sign in to ${action}.`) };
  const workspace = await findWorkspaceForUser(supabase, user.id);
  if (!workspace) return { ok: false, response: apiError(403, "FORBIDDEN", "You don't have access to a barbershop workspace.") };
  return { ok: true, supabase, user, workspace };
}
