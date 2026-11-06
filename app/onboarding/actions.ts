"use server";

import { redirect } from "next/navigation";

import { classifyWorkspaceError, workspaceErrorMessage } from "@/lib/auth/errors";
import type { FormState } from "@/lib/auth/form-state";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { createWorkspace } from "@/lib/db/workspace";
import { fieldErrors, workspaceNameSchema } from "@/lib/validation/auth";

export async function createWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding");

  const rawName = formData.get("name");
  const parsed = workspaceNameSchema.safeParse({ name: rawName });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
      values: { name: typeof rawName === "string" ? rawName.slice(0, 100) : undefined },
    };
  }

  // The database function derives the owner from the verified JWT, so the
  // client cannot create a workspace for someone else.
  const supabase = await createSupabaseServerClient();
  const { error } = await createWorkspace(supabase, parsed.data.name);

  if (error) {
    const kind = classifyWorkspaceError(error);
    if (kind === "exists") redirect("/dashboard");
    if (kind === "unauthenticated") redirect("/login?next=/onboarding");
    return { status: "error", message: workspaceErrorMessage(kind), values: { name: parsed.data.name } };
  }

  redirect("/dashboard");
}
