"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/db/supabase/server";

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // Revoke only this device's session; clears auth cookies via the cookie adapter.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
