"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/auth/form-state";
import { getOwnerWorkspace } from "@/lib/auth/session";
import { createBarber, createService, updateBarber, updateService, type CatalogWriteResult } from "@/lib/db/catalog";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { activeFlagSchema, barberFormSchema, recordIdSchema, serviceFormSchema } from "@/lib/validation/catalog";

const NOT_OWNER: FormState = { status: "error", message: "Only the barbershop owner can change barbers and services." };

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

function failure(result: Exclude<CatalogWriteResult, { ok: true }>, values: FormState["values"]): FormState {
  const message =
    result.reason === "not_found"
      ? "That record no longer exists."
      : result.reason === "invalid"
        ? "Some values are out of range. Check them and try again."
        : result.reason === "forbidden"
          ? NOT_OWNER.message
          : "Could not save your changes. Please try again.";
  return { status: "error", message, values };
}

function refreshCatalogPages() {
  revalidatePath("/settings");
  revalidatePath("/sales/new");
}

function success(prev: FormState, message: string): FormState {
  return { status: "success", message, successCount: (prev.successCount ?? 0) + 1 };
}

// ---------------------------------------------------------------------------
// Barbers
// ---------------------------------------------------------------------------

export async function saveBarberAction(prev: FormState, formData: FormData): Promise<FormState> {
  const workspace = await getOwnerWorkspace();
  if (!workspace) return NOT_OWNER;

  const values = { name: str(formData, "name"), commissionRate: str(formData, "commissionRate") };
  const parsed = barberFormSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const rawId = str(formData, "id");
  const supabase = await createSupabaseServerClient();
  const input = { name: parsed.data.name, commissionRateBp: parsed.data.commissionRate };

  let result: CatalogWriteResult;
  if (rawId) {
    const id = recordIdSchema.safeParse(rawId);
    if (!id.success) return { status: "error", message: "Invalid barber.", values };
    result = await updateBarber(supabase, workspace.barbershopId, id.data, input);
  } else {
    result = await createBarber(supabase, workspace.barbershopId, input);
  }
  if (!result.ok) return failure(result, values);

  refreshCatalogPages();
  return success(prev, rawId ? `Saved ${parsed.data.name}.` : `Added ${parsed.data.name}.`);
}

export async function setBarberActiveAction(prev: FormState, formData: FormData): Promise<FormState> {
  const workspace = await getOwnerWorkspace();
  if (!workspace) return NOT_OWNER;

  const id = recordIdSchema.safeParse(formData.get("id"));
  const active = activeFlagSchema.safeParse(formData.get("active"));
  if (!id.success || !active.success) return { status: "error", message: "Invalid request." };

  const supabase = await createSupabaseServerClient();
  const result = await updateBarber(supabase, workspace.barbershopId, id.data, { active: active.data });
  if (!result.ok) return failure(result, undefined);

  refreshCatalogPages();
  return success(prev, active.data ? "Barber reactivated." : "Barber deactivated.");
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function saveServiceAction(prev: FormState, formData: FormData): Promise<FormState> {
  const workspace = await getOwnerWorkspace();
  if (!workspace) return NOT_OWNER;

  const values = { name: str(formData, "name"), price: str(formData, "price") };
  const parsed = serviceFormSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const rawId = str(formData, "id");
  const supabase = await createSupabaseServerClient();
  const input = { name: parsed.data.name, priceCentavos: parsed.data.price };

  let result: CatalogWriteResult;
  if (rawId) {
    const id = recordIdSchema.safeParse(rawId);
    if (!id.success) return { status: "error", message: "Invalid service.", values };
    result = await updateService(supabase, workspace.barbershopId, id.data, input);
  } else {
    result = await createService(supabase, workspace.barbershopId, input);
  }
  if (!result.ok) return failure(result, values);

  refreshCatalogPages();
  return success(prev, rawId ? `Saved ${parsed.data.name}.` : `Added ${parsed.data.name}.`);
}

export async function setServiceActiveAction(prev: FormState, formData: FormData): Promise<FormState> {
  const workspace = await getOwnerWorkspace();
  if (!workspace) return NOT_OWNER;

  const id = recordIdSchema.safeParse(formData.get("id"));
  const active = activeFlagSchema.safeParse(formData.get("active"));
  if (!id.success || !active.success) return { status: "error", message: "Invalid request." };

  const supabase = await createSupabaseServerClient();
  const result = await updateService(supabase, workspace.barbershopId, id.data, { active: active.data });
  if (!result.ok) return failure(result, undefined);

  refreshCatalogPages();
  return success(prev, active.data ? "Service reactivated." : "Service deactivated.");
}
