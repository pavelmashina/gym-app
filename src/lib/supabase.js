import { createClient } from '@supabase/supabase-js';
import { createResilientFetch, isReachable } from './requestResilience.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const resilientFetch = createResilientFetch((...args) => fetch(...args));

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: resilientFetch,
      },
    })
  : null;

export const isSupabaseReachable = () => isReachable(`${supabaseUrl}/auth/v1/health`);
