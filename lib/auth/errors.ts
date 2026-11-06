/**
 * Map Supabase Auth / PostgREST errors to safe, user-facing messages.
 * Never surface raw upstream messages, which may reveal internals or whether
 * an account exists.
 */

interface MaybeCodedError {
  code?: string | null;
  status?: number | null;
  message?: string | null;
}

export function authErrorMessage(error: MaybeCodedError | null | undefined): string {
  switch (error?.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Confirm your email address before signing in.";
    case "user_already_exists":
    case "email_exists":
      // Keep generic to avoid account enumeration.
      return "Could not create an account with those details. Try signing in instead.";
    case "weak_password":
      return "Choose a stronger password (at least 8 characters).";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "signup_disabled":
      return "New sign-ups are currently disabled.";
    default:
      if (error?.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
      return "Something went wrong. Please try again.";
  }
}

export type WorkspaceErrorKind = "exists" | "invalid" | "unauthenticated" | "unknown";

/** Classify errors raised by the create_barbershop() database function. */
export function classifyWorkspaceError(error: MaybeCodedError | null | undefined): WorkspaceErrorKind {
  switch (error?.code) {
    case "23505":
      return "exists";
    case "22023":
    case "23514":
      return "invalid";
    case "28000":
    case "42501":
      return "unauthenticated";
    default:
      return "unknown";
  }
}

export function workspaceErrorMessage(kind: WorkspaceErrorKind): string {
  switch (kind) {
    case "exists":
      return "You already have a barbershop workspace.";
    case "invalid":
      return "Barbershop name must be 1 to 100 characters.";
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    default:
      return "Could not create your workspace. Please try again.";
  }
}
