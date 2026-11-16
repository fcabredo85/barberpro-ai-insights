// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
}));
vi.mock("@/lib/auth/site-origin", () => ({ siteOrigin: async () => "https://shop.example" }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { changePasswordAction, requestPasswordResetAction, updatePasswordAction } from "@/app/auth/password-actions";
import { initialFormState } from "@/lib/auth/form-state";
import { RESET_EMAIL_SENT_MESSAGE } from "@/lib/auth/password";
import { decideRoute } from "@/lib/auth/routes";
import { changePasswordSchema, fieldErrors, newPasswordSchema } from "@/lib/validation/auth";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const USER = { id: "user-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: USER } });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("password validation", () => {
  it("requires the confirmation to match", () => {
    const r = newPasswordSchema.safeParse({ password: "longenough1", confirmPassword: "different1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirmPassword).toBe("The passwords don't match.");
  });

  it("enforces 8 to 72 characters for a new password", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    const long = "x".repeat(73);
    expect(newPasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
  });

  it("rejects a new password equal to the current one", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "samepass1", password: "samepass1", confirmPassword: "samepass1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).password).toMatch(/different/);
  });
});

describe("requestPasswordResetAction (forgot password)", () => {
  it("sends a reset link that returns through /auth/callback to /reset-password", async () => {
    const state = await requestPasswordResetAction(initialFormState, form({ email: " Owner@Example.com " }));
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner@example.com", {
      redirectTo: "https://shop.example/auth/callback?next=/reset-password",
    });
    expect(state).toMatchObject({ status: "success", message: RESET_EMAIL_SENT_MESSAGE });
  });

  it("gives the same reply when the account doesn't exist (no account discovery)", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found", status: 400 } });
    const state = await requestPasswordResetAction(initialFormState, form({ email: "nobody@example.com" }));
    expect(state).toMatchObject({ status: "success", message: RESET_EMAIL_SENT_MESSAGE });
  });

  it("reports rate limits", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    const state = await requestPasswordResetAction(initialFormState, form({ email: "owner@example.com" }));
    expect(state).toMatchObject({ status: "error", message: expect.stringMatching(/too many attempts/i) });
  });

  it("validates the email without calling Supabase", async () => {
    const state = await requestPasswordResetAction(initialFormState, form({ email: "not-an-email" }));
    expect(state.fieldErrors?.email).toBe("Enter a valid email address.");
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("updatePasswordAction (reset from email link)", () => {
  it("updates the password and redirects to the dashboard", async () => {
    await expect(
      updatePasswordAction(initialFormState, form({ password: "newpassword1", confirmPassword: "newpassword1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?password=updated");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "newpassword1" });
  });

  it("refuses without a recovery session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const state = await updatePasswordAction(initialFormState, form({ password: "newpassword1", confirmPassword: "newpassword1" }));
    expect(state).toMatchObject({ status: "error", message: expect.stringMatching(/invalid or has expired/) });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("shows a safe message when Supabase rejects the new password", async () => {
    mocks.updateUser.mockResolvedValue({ error: { code: "same_password", status: 422 } });
    const state = await updatePasswordAction(initialFormState, form({ password: "newpassword1", confirmPassword: "newpassword1" }));
    expect(state.message).toBe("Choose a password different from your current one.");
  });

  it("does not call Supabase when the passwords don't match", async () => {
    const state = await updatePasswordAction(initialFormState, form({ password: "newpassword1", confirmPassword: "other12345" }));
    expect(state.fieldErrors?.confirmPassword).toBeDefined();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("changePasswordAction (Settings)", () => {
  const valid = { currentPassword: "oldpassword1", password: "newpassword1", confirmPassword: "newpassword1" };

  it("verifies the current password before changing it", async () => {
    const state = await changePasswordAction(initialFormState, form(valid));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: USER.email, password: "oldpassword1" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "newpassword1" });
    expect(state).toMatchObject({ status: "success", successCount: 1 });
  });

  it("rejects a wrong current password and leaves the password unchanged", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400 } });
    const state = await changePasswordAction(initialFormState, form(valid));
    expect(state.fieldErrors?.currentPassword).toBe("Your current password is incorrect.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const state = await changePasswordAction(initialFormState, form(valid));
    expect(state.message).toMatch(/session has expired/);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("routing", () => {
  it("treats /forgot-password as guest-only and keeps /reset-password reachable", () => {
    expect(decideRoute("/forgot-password", false)).toEqual({ type: "next" });
    expect(decideRoute("/forgot-password", true)).toEqual({ type: "redirect", pathname: "/dashboard" });
    expect(decideRoute("/reset-password", true)).toEqual({ type: "next" });
    expect(decideRoute("/reset-password", false)).toEqual({ type: "next" });
  });
});
