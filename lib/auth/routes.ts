/** Path prefixes that require a signed-in user. */
export const PROTECTED_PREFIXES = ["/dashboard", "/sales", "/settings", "/onboarding"] as const;

/** Pages a signed-in user has no reason to see. */
const GUEST_ONLY_PATHS = ["/login"] as const;

export const DEFAULT_AUTHED_PATH = "/dashboard";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/**
 * Accept only same-origin relative paths for post-login redirects, preventing
 * open redirects such as `//evil.example` or `https://evil.example`.
 */
export function safeRedirectPath(value: unknown, fallback: string = DEFAULT_AUTHED_PATH): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; pathname: string; search?: string };

/** Pure routing rule used by the proxy; easy to unit test. */
export function decideRoute(pathname: string, isAuthenticated: boolean): RouteDecision {
  if (!isAuthenticated && isProtectedPath(pathname)) {
    return {
      type: "redirect",
      pathname: "/login",
      search: `?next=${encodeURIComponent(pathname)}`,
    };
  }
  if (isAuthenticated && GUEST_ONLY_PATHS.some((p) => matchesPrefix(pathname, p))) {
    return { type: "redirect", pathname: DEFAULT_AUTHED_PATH };
  }
  return { type: "next" };
}
