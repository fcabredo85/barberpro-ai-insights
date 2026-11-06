import { describe, expect, it } from "vitest";

import { classifyWorkspaceError, authErrorMessage } from "@/lib/auth/errors";
import { fieldErrors, signInSchema, signUpSchema, workspaceNameSchema } from "@/lib/validation/auth";

describe("auth input validation", () => {
  it("normalizes email case and whitespace", () => {
    const result = signInSchema.parse({ email: "  Owner@Example.COM ", password: "x" });
    expect(result.email).toBe("owner@example.com");
  });

  it("reports an actionable error for an invalid email", () => {
    const result = signInSchema.safeParse({ email: "not-an-email", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).email).toBe("Enter a valid email address.");
  });

  it("requires sign-up passwords of 8 to 72 characters", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "longenough" }).success).toBe(true);
  });

  it("rejects missing fields with per-field messages", () => {
    const result = signUpSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
    }
  });

  it("trims workspace names and enforces 1-100 characters", () => {
    expect(workspaceNameSchema.parse({ name: "  Kanto Cuts  " }).name).toBe("Kanto Cuts");
    expect(workspaceNameSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(workspaceNameSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("auth error mapping", () => {
  it("does not reveal whether an account exists", () => {
    expect(authErrorMessage({ code: "user_already_exists" })).not.toMatch(/already/i);
  });

  it("never echoes raw upstream messages", () => {
    const message = authErrorMessage({ code: "unexpected", message: "relation auth.users leaked" });
    expect(message).toBe("Something went wrong. Please try again.");
  });

  it("classifies create_barbershop database errors", () => {
    expect(classifyWorkspaceError({ code: "23505" })).toBe("exists");
    expect(classifyWorkspaceError({ code: "22023" })).toBe("invalid");
    expect(classifyWorkspaceError({ code: "28000" })).toBe("unauthenticated");
    expect(classifyWorkspaceError({ code: "XX000" })).toBe("unknown");
  });
});
