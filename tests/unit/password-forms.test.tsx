import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ signInAction: vi.fn(), signUpAction: vi.fn() }));
vi.mock("@/app/auth/password-actions", () => ({
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  changePasswordAction: vi.fn(),
}));

import { AuthForm } from "@/components/auth/auth-form";
import { ChangePasswordForm, ForgotPasswordForm, ResetPasswordForm } from "@/components/auth/password-forms";

describe("password UI", () => {
  it("shows 'Forgot password?' on sign-in only", () => {
    const { unmount } = render(<AuthForm mode="signin" />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    unmount();
    render(<AuthForm mode="signup" />);
    expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
  });

  it("forgot-password form asks only for the email", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Email me a reset link" })).toBeInTheDocument();
  });

  it("reset form asks for the new password twice, marked as a new password", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("change form asks for the current password and the new one twice", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("name", "confirmPassword");
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });
});
