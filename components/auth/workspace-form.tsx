"use client";

import { useActionState } from "react";

import { createWorkspaceAction } from "@/app/onboarding/actions";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";

export function WorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate key={state.values?.name ?? "empty"}>
      <FormMessage state={state} />
      <FormField
        id="name"
        name="name"
        label="Barbershop name"
        placeholder="e.g. Kanto Cuts Barbershop"
        autoComplete="organization"
        required
        maxLength={100}
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
