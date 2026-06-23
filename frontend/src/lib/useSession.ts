'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from './supabase';

export type AuthStatus = 'loading' | 'anon' | 'authed';

export interface SessionState {
  status: AuthStatus;
  /** Supabase access token (the JWT the backend verifies). */
  accessToken: string | null;
  email: string | null;
  signOut: () => Promise<void>;
}

/**
 * Subscribes to the Supabase auth session (E6.3). Returns the current access
 * token so callers can attach it to API requests, plus a coarse `status` for
 * gating UI (loading → anon/authed).
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    status: loading ? 'loading' : session ? 'authed' : 'anon',
    accessToken: session?.access_token ?? null,
    email: session?.user.email ?? null,
    signOut: async () => {
      await getSupabaseBrowserClient().auth.signOut();
    },
  };
}
