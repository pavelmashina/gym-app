import { useEffect, useState } from 'react';
import '../app-update-notice.css';

const CURRENT_BUILD = import.meta.env.VITE_APP_BUILD_ID || '';
const CHECK_INTERVAL = 90000;

/** Two circular arrows chasing each other, with a small exclamation mark at their bottom right. */
function UpdateAvailableIcon() {
  return <svg className="app-update-notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g className="app-update-notice-arrows">
      <path d="M3.9 9.1A6.75 6.75 0 0 1 16.03 6.63" />
      <path d="M16.58 3.48 16.03 6.63 12.88 6.08" />
      <path d="M17.1 11.9A6.75 6.75 0 0 1 4.97 14.37" />
      <path d="M4.42 17.52 4.97 14.37 8.12 14.92" />
    </g>
    <path className="app-update-notice-mark" d="M20 15.2v3.3M20 21.4h.01" />
  </svg>;
}

/** The server manifest is published together with the new index and hashed assets. */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!CURRENT_BUILD || CURRENT_BUILD === 'dev') return undefined;
    let mounted = true;
    // Per effect run, not a ref: StrictMode re-runs the effect while the first request is in flight.
    let checking = false;
    async function checkVersion() {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const base = import.meta.env.BASE_URL || '/';
        const result = await fetch(`${base}version.json?t=${Date.now()}`, { cache:'no-store' });
        if (!result.ok) return;
        const data = await result.json();
        if (mounted && /^[a-f0-9]{40}$/i.test(data?.version) && data.version !== CURRENT_BUILD) {
          setAvailable(data.version);
        }
      } catch (error) {
        // Offline or temporarily unavailable deployments must not disturb the UI.
        console.info('Update check unavailable:', error);
      } finally {
        checking = false;
      }
    }
    const interval = window.setInterval(checkVersion, CHECK_INTERVAL);
    const onFocus = () => { void checkVersion(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void checkVersion(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    void checkVersion();
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  function reloadUpdatedApp() {
    if (!available || reloading) return;
    setReloading(true);
    const url = new URL(window.location.href);
    url.searchParams.set('app_version', available.slice(0, 12));
    // Navigate instead of soft refresh: forces a fresh HTML entrypoint and Vite bundle.
    window.location.replace(url.href);
  }

  if (!available) return null;
  // A small icon in the top-right corner instead of a banner (issue #49); the text is for screen readers.
  return <div className="app-update-notice">
    <span className="app-update-notice-status" role="status">Доступна новая версия GYM APP</span>
    <button type="button" className={reloading ? 'is-reloading' : undefined} onClick={reloadUpdatedApp} aria-label="Доступна новая версия GYM APP. Обновить" title="Доступна новая версия — нажмите, чтобы обновить" aria-busy={reloading || undefined}>
      <UpdateAvailableIcon />
    </button>
  </div>;
}
