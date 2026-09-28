import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two client factories, matching the NFR that the service role key
 * only ever lives in the worker process, never in the web app bundle.
 */

// Found live: a single hung network request to Supabase (no response, no
// error, just silence) blocked an entire worker run indefinitely - a batch
// of extract jobs finished every item successfully, then sat forever
// because the final completeJob() call's fetch never resolved or rejected.
// Nothing in this codebase set any timeout on a Supabase call anywhere, so
// there was no way to recover. Wrapping every request made through these
// clients with an AbortController timeout means a stuck request surfaces
// as an ordinary thrown error instead of hanging the process forever.
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function timeoutFetch(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
  };
}

export function createAnonClient(url: string, publishableKey: string): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { persistSession: false },
    global: { fetch: timeoutFetch(DEFAULT_FETCH_TIMEOUT_MS) },
  });
}

export function createServiceRoleClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch(DEFAULT_FETCH_TIMEOUT_MS) },
  });
}
