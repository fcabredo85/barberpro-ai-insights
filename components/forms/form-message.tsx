import type { FormState } from "@/lib/auth/form-state";
import { cn } from "@/lib/utils";

/** Form-level status message announced to assistive technology. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        isError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
    >
      {state.message}
    </p>
  );
}
