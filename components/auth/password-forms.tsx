"use client";

import Link from "next/link";
import { useActionState } from "react";

import { changePasswordAction, requestPasswordResetAction, updatePasswordAction } from "@/app/auth/password-actions";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";

const NEW_PASSWORD_HINT = "8 to 72 characters.";

/** /forgot-password: request a reset link by email. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialFormState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4" noValidate key={state.values?.email ?? "empty"}>
        <FormMessage state={state} />
        <FormField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a reset link"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** /reset-password: choose a new password after following the email link. */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <FormField
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={NEW_PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

/** Settings: change the password while signed in. */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialFormState);

  return (
    // Re-keyed after each success so the password fields are cleared.
    <form action={formAction} className="max-w-sm space-y-4" noValidate key={`pw-${state.successCount ?? 0}`}>
      <FormMessage state={state} />
      <FormField
        id="currentPassword"
        name="currentPassword"
        type="password"
        label="Current password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <FormField
        id="newPassword"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={NEW_PASSWORD_HINT}
        error={state.fieldErrors?.password}
      />
      <FormField
        id="confirmNewPassword"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
