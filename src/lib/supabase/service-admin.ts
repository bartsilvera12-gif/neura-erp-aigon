import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleClientOptions, type AppSupabaseClient } from "@/lib/supabase/schema";

/** Cliente service role (servidor): webhooks, /r redirect, jobs. */
export function createServiceRoleClient(): AppSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { ...supabaseServiceRoleClientOptions }) as AppSupabaseClient;
}
