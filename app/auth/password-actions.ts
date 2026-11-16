"use server";

import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import type { FormState } from "@/lib/auth/form-state";
import { RESET_EMAIL_SENT_MESSAGE, RESET_PASSWORD_PATH } from "@/lib/auth/password";
import { siteOrigin } from "@/lib/auth/site-origin";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import {
  changePasswordSchema,
  fieldErrors,
  newPasswordSchema,
  passwordResetRequestSchema,
} from "@/lib/validation/auth";

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_email_send_rate_limit"]);

/** Forgot password: email a one-time link that signs the user in and opens /reset-password. */
export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawEmail = formData.get("email");
  const parsed = passwordResetRequestSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
      values: { email: typeof rawEmail === "string" ? rawEmail.slice(0, 254) : undefined },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=${RESET_PASSWORD_PATH}`,
  });
  // Only rate limits are reported; any other outcome (including "no such user") gets the generic reply.
  if (error && (RATE_LIMIT_CODES.has(error.code ?? "") || error.status === 429)) {
    return { status: "error", message: authErrorMessage(error), values: { email: parsed.data.email } };
  }
  return { status: "success", message: RESET_EMAIL_SENT_MESSAGE, values: { email: parsed.data.email } };
}

/** Reset password: set a new password for the user signed in by the recovery link. */
export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "This reset link is invalid or has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };

  redirect("/dashboard?password=updated");
}

/** Settings: change the password of the signed-in user after confirming the current one. */
export async function changePasswordAction(prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: "error", message: "Your session has expired. Please sign in again." };

  // Confirm the current password, so an unattended signed-in browser can't be used to take over the account.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    if (verifyError.code === "invalid_credentials") {
      return { status: "error", fieldErrors: { currentPassword: "Your current password is incorrect." } };
    }
    return { status: "error", message: authErrorMessage(verifyError) };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };

  return {
    status: "success",
    message: "Your password has been changed.",
    successCount: (prev.successCount ?? 0) + 1,
  };
}
