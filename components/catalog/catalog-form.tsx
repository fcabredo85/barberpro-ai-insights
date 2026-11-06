"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";
import { CATALOG_CONFIG, type CatalogKind } from "./catalog-config";

interface CatalogFormProps {
  kind: CatalogKind;
  /** Present when editing an existing record. */
  id?: string;
  initialValues?: Record<string, string>;
  onDone?: () => void;
}

/** Add or edit a barber/service. Validation happens on the server with Zod. */
export function CatalogForm({ kind, id, initialValues, onDone }: CatalogFormProps) {
  const config = CATALOG_CONFIG[kind];
  const [state, formAction, pending] = useActionState(config.saveAction, initialFormState);
  const isEdit = Boolean(id);
  const lastSuccess = useRef(0);

  useEffect(() => {
    const count = state.successCount ?? 0;
    if (count > lastSuccess.current) {
      lastSuccess.current = count;
      if (isEdit) onDone?.();
    }
  }, [state.successCount, isEdit, onDone]);

  // After a successful add, remount with empty fields; after an error, keep what was typed.
  const formKey = state.status === "error" ? `err-${JSON.stringify(state.values)}` : `ok-${state.successCount ?? 0}`;
  const values = state.status === "error" ? state.values : isEdit ? initialValues : undefined;
  const prefix = `${kind}-${id ?? "new"}`;

  return (
    <form action={formAction} key={formKey} className="space-y-3" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.status === "error" || !isEdit ? <FormMessage state={state} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {config.fields.map((field) => (
          <FormField
            key={field.name}
            id={`${prefix}-${field.name}`}
            name={field.name}
            label={field.label}
            placeholder={field.placeholder}
            inputMode={field.inputMode}
            prefix={"prefix" in field ? field.prefix : undefined}
            suffix={"suffix" in field ? field.suffix : undefined}
            hint={"hint" in field ? field.hint : undefined}
            maxLength={field.maxLength}
            autoComplete="off"
            required
            defaultValue={values?.[field.name]}
            error={state.fieldErrors?.[field.name]}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : `Add ${config.noun}`}
        </Button>
        {isEdit ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
