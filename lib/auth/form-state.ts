/** Result returned by auth and onboarding Server Actions to `useActionState`. */
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Echo non-secret input back so the form keeps it after an error. */
  values?: { email?: string; name?: string };
}

export const initialFormState: FormState = { status: "idle" };
