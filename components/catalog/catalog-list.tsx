"use client";

import { useActionState, useCallback, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/auth/form-state";
import { cn } from "@/lib/utils";
import { CATALOG_CONFIG, type CatalogItem, type CatalogKind } from "./catalog-config";
import { CatalogForm } from "./catalog-form";

function CatalogRow({ kind, item }: { kind: CatalogKind; item: CatalogItem }) {
  const config = CATALOG_CONFIG[kind];
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction, toggling] = useActionState(config.setActiveAction, initialFormState);
  const stopEditing = useCallback(() => setEditing(false), []);

  return (
    <li className={cn("space-y-3 py-3", !item.active && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="break-words font-medium sm:truncate">{item.name}</p>
          <p className="text-sm tabular-nums text-muted-foreground">{item.detail}</p>
        </div>
        <Badge variant={item.active ? "secondary" : "outline"}>{item.active ? "Active" : "Inactive"}</Badge>
        <div className="flex gap-2">
          {!editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${item.name}`}
            >
              Edit
            </Button>
          ) : null}
          <form action={toggleAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value={item.active ? "false" : "true"} />
            <Button
              type="submit"
              variant={item.active ? "ghost" : "secondary"}
              size="sm"
              disabled={toggling}
              aria-label={`${item.active ? "Deactivate" : "Reactivate"} ${item.name}`}
            >
              {item.active ? "Deactivate" : "Reactivate"}
            </Button>
          </form>
        </div>
      </div>
      {toggleState.status === "error" ? <FormMessage state={toggleState} /> : null}
      {editing ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <CatalogForm kind={kind} id={item.id} initialValues={item.editValues} onDone={stopEditing} />
        </div>
      ) : null}
    </li>
  );
}

export function CatalogList({ kind, items }: { kind: CatalogKind; items: readonly CatalogItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        No {CATALOG_CONFIG[kind].noun}s yet. Add your first one above.
      </p>
    );
  }
  return (
    <ul className="divide-y" aria-label={`${CATALOG_CONFIG[kind].noun}s`}>
      {items.map((item) => (
        <CatalogRow key={`${item.id}-${item.detail}-${item.active}`} kind={kind} item={item} />
      ))}
    </ul>
  );
}
