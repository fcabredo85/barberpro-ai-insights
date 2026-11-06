"use client";

import { useActionState } from "react";

import { renameBarbershopAction } from "@/app/(app)/settings/actions";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";

export function BarbershopNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(renameBarbershopAction, initialFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate key={`${state.status}-${state.successCount ?? 0}`}>
      <FormMessage state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField
          id="barbershop-name"
          name="name"
          label="Barbershop name"
          autoComplete="organization"
          maxLength={100}
          required
          defaultValue={state.values?.name ?? currentName}
          error={state.fieldErrors?.name}
          className="sm:max-w-sm sm:flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}
