import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two client factories, matching the NFR that the service role key
 * only ever lives in the worker process, never in the web app bundle.
 */

export function createAnonClient(url: string, publishableKey: string): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { persistSession: false },
  });
}

export function createServiceRoleClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
