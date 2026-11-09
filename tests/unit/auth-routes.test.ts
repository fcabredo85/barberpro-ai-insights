import { describe, expect, it } from "vitest";

import { decideRoute, isProtectedPath, safeRedirectPath } from "@/lib/auth/routes";

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/sales", "/sales/new", "/settings", "/studio", "/appointments", "/appointments/new", "/onboarding"])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/", "/login", "/auth/callback", "/salesforce", "/dashboards", "/api/health"])(
    "does not protect %s",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe("decideRoute", () => {
  it("redirects signed-out users from private pages to login with a return path", () => {
    expect(decideRoute("/sales/new", false)).toEqual({
      type: "redirect",
      pathname: "/login",
      search: "?next=%2Fsales%2Fnew",
    });
  });

  it("lets signed-out users see public pages", () => {
    expect(decideRoute("/", false)).toEqual({ type: "next" });
    expect(decideRoute("/login", false)).toEqual({ type: "next" });
  });

  it("sends signed-in users away from the login page", () => {
    expect(decideRoute("/login", true)).toEqual({ type: "redirect", pathname: "/dashboard" });
  });

  it("lets signed-in users reach private pages", () => {
    expect(decideRoute("/dashboard", true)).toEqual({ type: "next" });
  });
});

describe("safeRedirectPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeRedirectPath("/sales?from=2026-11-01")).toBe("/sales?from=2026-11-01");
  });

  it.each([
    ["protocol-relative URL", "//evil.example"],
    ["absolute URL", "https://evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["relative path", "dashboard"],
    ["control characters", "/dash\nboard"],
    ["non-string", 42],
    ["missing", null],
  ])("rejects %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });
});
