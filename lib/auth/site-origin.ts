import "server-only";

import { headers } from "next/headers";

/**
 * Absolute origin for links in auth emails (sign-up confirmation, password
 * reset). Prefers NEXT_PUBLIC_SITE_URL; otherwise uses the request host.
 * Supabase only sends links whose URL is on the project's redirect allow-list.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
