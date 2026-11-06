"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction, signUpAction } from "@/app/login/actions";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";

export type AuthMode = "signin" | "signup";

interface AuthFormProps {
  mode: AuthMode;
  next?: string;
  initialMessage?: string;
}

export function AuthForm({ mode, next, initialMessage }: AuthFormProps) {
  const action = mode === "signup" ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState(
    action,
    initialMessage ? { status: "error" as const, message: initialMessage } : initialFormState,
  );
  const isSignUp = mode === "signup";

  return (
    <div className="space-y-4">
      {/* key resets field defaults when the server echoes values back */}
      <form action={formAction} className="space-y-4" noValidate key={state.values?.email ?? "empty"}>
        <FormMessage state={state} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
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
        <FormField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={isSignUp ? 8 : undefined}
          error={state.fieldErrors?.password}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "New to BarberPro AI? "}
        <Link
          href={isSignUp ? "/login" : "/login?mode=signup"}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
