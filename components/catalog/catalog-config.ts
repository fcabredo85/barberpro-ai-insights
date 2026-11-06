import type { HTMLAttributes } from "react";

import {
  saveBarberAction,
  saveServiceAction,
  setBarberActiveAction,
  setServiceActiveAction,
} from "@/app/(app)/settings/actions";

export type CatalogKind = "barber" | "service";

export interface CatalogFieldConfig {
  name: string;
  label: string;
  placeholder: string;
  inputMode: HTMLAttributes<HTMLInputElement>["inputMode"];
  prefix?: string;
  suffix?: string;
  hint?: string;
  maxLength: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  /** Display value, e.g. "40%" or "₱250.00". */
  detail: string;
  active: boolean;
  /** Raw values to prefill the edit form. */
  editValues: Record<string, string>;
}

export const CATALOG_CONFIG = {
  barber: {
    noun: "barber",
    saveAction: saveBarberAction,
    setActiveAction: setBarberActiveAction,
    fields: [
      { name: "name", label: "Barber name", placeholder: "e.g. Paolo", inputMode: "text", maxLength: 100 },
      {
        name: "commissionRate",
        label: "Commission rate",
        placeholder: "40",
        inputMode: "decimal",
        suffix: "%",
        hint: "Share of each sale paid to the barber (0–100%).",
        maxLength: 6,
      },
    ],
  },
  service: {
    noun: "service",
    saveAction: saveServiceAction,
    setActiveAction: setServiceActiveAction,
    fields: [
      { name: "name", label: "Service name", placeholder: "e.g. Haircut", inputMode: "text", maxLength: 100 },
      {
        name: "price",
        label: "Price",
        placeholder: "250.00",
        inputMode: "decimal",
        prefix: "₱",
        hint: "Price per service in pesos.",
        maxLength: 13,
      },
    ],
  },
} as const satisfies Record<CatalogKind, {
  noun: string;
  saveAction: unknown;
  setActiveAction: unknown;
  fields: readonly CatalogFieldConfig[];
}>;
