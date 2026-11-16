import { NextResponse, type NextRequest } from "next/server";

import { RESET_PASSWORD_PATH } from "@/lib/auth/password";
import { safeRedirectPath } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";

/**
 * Completes an email link (sign-up confirmation or password reset, PKCE) by
 * exchanging the one-time code for a session, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const errorKey = next === RESET_PASSWORD_PATH ? "reset_link_invalid" : "confirmation_failed";
  return NextResponse.redirect(new URL(`/login?error=${errorKey}`, origin));
}
