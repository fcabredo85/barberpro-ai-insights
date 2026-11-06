import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

/** Any Supabase client typed for this schema (server session client or a test client). */
export type DbClient = SupabaseClient<Database>;

export type DbPaymentMethod = Database["public"]["Enums"]["payment_method"];
