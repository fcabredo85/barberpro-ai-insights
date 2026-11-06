/** Result returned by Server Actions to `useActionState`. */
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Echo non-secret input back so the form keeps it after an error. */
  values?: Partial<Record<string, string>>;
  /** Increments on each success so forms can reset themselves. */
  successCount?: number;
}

export const initialFormState: FormState = { status: "idle" };
