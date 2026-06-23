'use client';

import { type SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client (E6.3). Singleton so the auth session (and its
 * refresh timer) isn't duplicated across components. Reads the public env —
 * the anon key is safe to expose; row-level security guards the data.
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see .env.example.',
    );
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Parse the magic-link tokens Supabase appends to the redirect URL.
      detectSessionInUrl: true,
    },
  });
  return client;
}
