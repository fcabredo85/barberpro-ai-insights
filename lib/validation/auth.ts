import { z } from "zod";

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254, { error: "Email is too long." }));

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Enter your password." })
    .min(1, { error: "Enter your password." })
    .max(72, { error: "Password is too long." }),
});

export const signUpSchema = z.object({
  email: emailSchema,
  // Matches supabase/config.toml minimum_password_length. bcrypt ignores bytes past 72.
  password: z
    .string({ error: "Choose a password." })
    .min(8, { error: "Password must be at least 8 characters." })
    .max(72, { error: "Password must be at most 72 characters." }),
});

/** A new password: same rules as sign-up, typed twice. */
const newPasswordField = z
  .string({ error: "Choose a new password." })
  .min(8, { error: "Password must be at least 8 characters." })
  .max(72, { error: "Password must be at most 72 characters." });

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string({ error: "Type the new password again." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "The passwords don't match.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password." })
      .min(1, { error: "Enter your current password." })
      .max(72, { error: "Password is too long." }),
    password: newPasswordField,
    confirmPassword: z.string({ error: "Type the new password again." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "The passwords don't match.",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    error: "Choose a password different from your current one.",
  });

export const workspaceNameSchema = z.object({
  name: z
    .string({ error: "Enter your barbershop name." })
    .trim()
    .min(1, { error: "Enter your barbershop name." })
    .max(100, { error: "Barbershop name must be at most 100 characters." }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type WorkspaceNameInput = z.infer<typeof workspaceNameSchema>;

/** Flatten Zod issues into one safe message per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
