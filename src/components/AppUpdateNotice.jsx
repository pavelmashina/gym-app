import { useEffect, useRef, useState } from 'react';
import '../app-update-notice.css';

const CURRENT_BUILD = import.meta.env.VITE_APP_BUILD_ID || '';
const CHECK_INTERVAL = 90000;

/** The server manifest is published together with the new index and hashed assets. */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(null);
  const activeRequest = useRef(false);

  useEffect(() => {
    if (!CURRENT_BUILD || CURRENT_BUILD === 'dev') return undefined;
    let mounted = true;
    async function checkVersion() {
      if (activeRequest.current || document.visibilityState === 'hidden') return;
      activeRequest.current = true;
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
        activeRequest.current = false;
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
    if (!available) return;
    const url = new URL(window.location.href);
    url.searchParams.set('app_version', available.slice(0, 12));
    // Navigate instead of soft refresh: forces a fresh HTML entrypoint and Vite bundle.
    window.location.replace(url.href);
  }

  if (!available) return null;
  return <div className="app-update-notice" role="status" aria-live="polite">
    <span>Доступна новая версия GYM APP</span>
    <button type="button" onClick={reloadUpdatedApp}>Обновить</button>
  </div>;
}
