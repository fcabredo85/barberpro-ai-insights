"use server";

import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import type { FormState } from "@/lib/auth/form-state";
import { safeRedirectPath } from "@/lib/auth/routes";
import { siteOrigin } from "@/lib/auth/site-origin";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { fieldErrors, signInSchema, signUpSchema } from "@/lib/validation/auth";

function readCredentials(formData: FormData) {
  return {
    email: formData.get("email"),
    password: formData.get("password"),
  };
}

function echoEmail(formData: FormData): string | undefined {
  const email = formData.get("email");
  return typeof email === "string" ? email.slice(0, 254) : undefined;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(readCredentials(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values: { email: echoEmail(formData) } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { status: "error", message: authErrorMessage(error), values: { email: parsed.data.email } };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(readCredentials(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values: { email: echoEmail(formData) } };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    // Supabase only honours redirect URLs on the project's allow-list.
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/onboarding` },
  });
  if (error) {
    return { status: "error", message: authErrorMessage(error), values: { email: parsed.data.email } };
  }

  // With email confirmation disabled (local dev) a session is returned immediately.
  if (data.session) redirect("/onboarding");

  return {
    status: "success",
    message: "Check your email to confirm your account, then sign in.",
    values: { email: parsed.data.email },
  };
}
