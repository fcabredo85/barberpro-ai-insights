import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";

/** Completes email confirmation (PKCE) by exchanging the one-time code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=confirmation_failed", origin));
}
