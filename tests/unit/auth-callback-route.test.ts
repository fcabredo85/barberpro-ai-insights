// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}));

import { GET } from "@/app/auth/callback/route";

const call = (query: string) => GET(new NextRequest(`http://localhost/auth/callback${query}`));
const location = (res: Response) => new URL(res.headers.get("location") ?? "").pathname + new URL(res.headers.get("location") ?? "").search;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("GET /auth/callback", () => {
  it("continues a valid password-reset link to /reset-password", async () => {
    const res = await call("?code=abc&next=/reset-password");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(location(res)).toBe("/reset-password");
  });

  it("explains an expired password-reset link", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "otp_expired" } });
    expect(location(await call("?code=old&next=/reset-password"))).toBe("/login?error=reset_link_invalid");
  });

  it("keeps the sign-up confirmation error for other links", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "otp_expired" } });
    expect(location(await call("?code=old&next=/onboarding"))).toBe("/login?error=confirmation_failed");
  });

  it("never redirects off-site", async () => {
    expect(location(await call("?code=abc&next=//evil.example"))).toBe("/dashboard");
  });
});
