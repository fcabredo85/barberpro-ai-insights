import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { decideRoute } from "@/lib/auth/routes";
import type { Database } from "@/lib/db/database.types";

/**
 * Refreshes the Supabase session cookie and applies optimistic route rules.
 * This is NOT the authorization boundary: server layouts, route handlers and
 * database RLS each verify access independently.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

  const supabase = createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the token with the Auth server (not just decoding it).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = decideRoute(request.nextUrl.pathname, user !== null);
  if (decision.type === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    url.search = decision.search ?? "";
    const redirect = NextResponse.redirect(url);
    // Preserve any refreshed auth cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
