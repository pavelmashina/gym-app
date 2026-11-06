// Browsers give fetch no deadline of its own, so on a weak mobile connection a
// request can stay pending indefinitely and leave a spinner or a disabled button
// on screen. Everything the workout flow waits for has to end, one way or another.

const READ_REQUEST_TIMEOUT_MS = 12_000;
const READ_REQUEST_ATTEMPTS = 2;
const WRITE_REQUEST_TIMEOUT_MS = 15_000;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shouldRetryResponse(response) {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

// Uploads and edge functions can legitimately take longer than an API call.
function hasWriteDeadline(input) {
  return /\/(rest|auth)\/v1\//.test(String(input?.url ?? input));
}

export function createResilientFetch(baseFetch, {
  readTimeoutMs = READ_REQUEST_TIMEOUT_MS,
  readAttempts = READ_REQUEST_ATTEMPTS,
  writeTimeoutMs = WRITE_REQUEST_TIMEOUT_MS,
  retryDelayMs = 500,
} = {}) {
  async function fetchWithTimeout(input, init, timeoutMs) {
    const controller = new AbortController();
    const sourceSignal = init.signal || input?.signal;
    const forwardAbort = () => controller.abort(sourceSignal?.reason);
    if (sourceSignal?.aborted) forwardAbort();
    else sourceSignal?.addEventListener?.('abort', forwardAbort, { once: true });

    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener?.('abort', forwardAbort);
    }
  }

  return async function resilientFetch(input, init = {}) {
    const method = (init.method || input?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      if (!hasWriteDeadline(input)) return baseFetch(input, init);
      // Never retried here: the server may have applied a write whose response was lost.
      return fetchWithTimeout(input, init, writeTimeoutMs);
    }

    const sourceSignal = init.signal || input?.signal;
    let lastError;
    for (let attempt = 0; attempt < readAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(input, init, readTimeoutMs);
        if (!shouldRetryResponse(response) || attempt === readAttempts - 1) return response;
        lastError = new Error(`Supabase temporarily returned ${response.status}`);
      } catch (error) {
        if (sourceSignal?.aborted) throw error;
        lastError = error;
        if (attempt === readAttempts - 1) throw error;
      }
      await wait(retryDelayMs * (attempt + 1));
    }
    throw lastError;
  };
}

export const NETWORK_FAILURE_HINT = 'Нет связи с сервером. Проверьте интернет и повторите.';

// Covers work that never reaches fetch, such as waiting on the auth token lock.
export function withDeadline(work, milliseconds, message = NETWORK_FAILURE_HINT) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.name = 'RequestDeadlineError';
      reject(error);
    }, milliseconds);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export function isNetworkError(error) {
  if (!error) return false;
  return /abort|deadline|failed to fetch|load failed|networkerror|network request failed|retryablefetch|timed? ?out/i
    .test(`${error.name ?? ''} ${error.message ?? ''}`);
}

export function describeRequestError(error, fallback) {
  console.error(fallback, error);
  return isNetworkError(error) ? `${fallback} ${NETWORK_FAILURE_HINT}` : fallback;
}

// auth-js keeps retrying a token refresh for 30 seconds before it gives up.
const SESSION_RESTORE_DEADLINE_MS = 20_000;
const REACHABILITY_TIMEOUT_MS = 8_000;

// When a token refresh fails on the network, auth-js answers "no session" but keeps
// the session stored. That answer must not reach the login screen as a sign-out.
export async function restoreSession(request, milliseconds = SESSION_RESTORE_DEADLINE_MS) {
  try {
    const { data, error } = await withDeadline(request, milliseconds);
    if (error && isNetworkError(error)) {
      console.warn('Session could not be restored without a connection:', error);
      return { session: null, unreachable: true };
    }
    if (error) console.error('Unable to restore Supabase session:', error);
    return { session: data?.session ?? null, unreachable: false };
  } catch (error) {
    console.warn('Session could not be restored:', error);
    return { session: null, unreachable: true };
  }
}

// Any answer counts, so the opaque response of a no-cors request is enough.
export async function isReachable(url, baseFetch = (...args) => fetch(...args), timeoutMs = REACHABILITY_TIMEOUT_MS) {
  const probe = createResilientFetch(baseFetch, { readTimeoutMs: timeoutMs, readAttempts: 1 });
  try {
    await probe(url, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}
