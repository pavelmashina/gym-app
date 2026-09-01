import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const READ_REQUEST_TIMEOUT_MS = 12_000;
const READ_REQUEST_ATTEMPTS = 2;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function shouldRetryResponse(response) {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

async function resilientFetch(input, init = {}) {
  const method = (init.method || input?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return fetch(input, init);

  let lastError;
  for (let attempt = 0; attempt < READ_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const sourceSignal = init.signal || input?.signal;
    const forwardAbort = () => controller.abort(sourceSignal?.reason);
    if (sourceSignal?.aborted) forwardAbort();
    else sourceSignal?.addEventListener?.('abort', forwardAbort, { once: true });

    const timeout = window.setTimeout(() => controller.abort(), READ_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!shouldRetryResponse(response) || attempt === READ_REQUEST_ATTEMPTS - 1) return response;
      lastError = new Error(`Supabase temporarily returned ${response.status}`);
    } catch (error) {
      if (sourceSignal?.aborted) throw error;
      lastError = error;
      if (attempt === READ_REQUEST_ATTEMPTS - 1) throw error;
    } finally {
      window.clearTimeout(timeout);
      sourceSignal?.removeEventListener?.('abort', forwardAbort);
    }

    await wait(500 * (attempt + 1));
  }

  throw lastError;
}

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
