/** Where the password-reset email link lands after /auth/callback signs the user in. */
export const RESET_PASSWORD_PATH = "/reset-password";

/** Same reply whether or not the account exists, so the form can't be used to discover accounts. */
export const RESET_EMAIL_SENT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. The link expires in 1 hour.";
