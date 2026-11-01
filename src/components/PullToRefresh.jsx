import { useEffect, useRef, useState } from 'react';
import '../pull-to-refresh.css';

export const PULL_REFRESH_THRESHOLD = 150;
const MAX_VISUAL_PULL = 104;
const HOLD_OFFSET = 76;
const RELEASE_DURATION_MS = 300;

export function pullProgress(deltaY) {
  return Math.max(0, Math.min(1, Number(deltaY) / PULL_REFRESH_THRESHOLD));
}

function scrollIsAtTop(target) {
  if (!(target instanceof Element)) return false;
  const detail = target.closest('.sportpit-detail-screen');
  if (detail && detail.scrollTop > 1) return false;
  let node = target;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollTop > 1 && node.scrollHeight > node.clientHeight + 3) return false;
    node = node.parentElement;
  }
  return Boolean(detail) || window.scrollY <= 1;
}

/**
 * The offset belongs to <html>, not the active React screen.
 * Data refreshes can remount screens; their replacement receives the same CSS
 * offset immediately and cannot snap back until the refresh promise settles.
 */
export function useStablePullSurface() {
  const endTimer = useRef(null);

  function clearPending() {
    if (endTimer.current !== null) {
      window.clearTimeout(endTimer.current);
      endTimer.current = null;
    }
  }

  function clearSurface() {
    clearPending();
    const root = document.documentElement;
    root.classList.remove('gym-pull-active');
    root.style.removeProperty('--gym-pull-offset');
    root.style.removeProperty('--gym-pull-transition');
  }

  function setOffset(distance, animate = false) {
    clearPending();
    const root = document.documentElement;
    root.style.setProperty('--gym-pull-transition', animate ? `${RELEASE_DURATION_MS}ms` : '0ms');
    root.style.setProperty('--gym-pull-offset', `${Math.max(0, distance)}px`);
    root.classList.add('gym-pull-active');
  }

  function returnToTop() {
    setOffset(0, true);
    endTimer.current = window.setTimeout(clearSurface, RELEASE_DURATION_MS + 40);
  }

  return { setOffset, returnToTop, clearPending, clearSurface };
}

export function PullToRefresh({ onRefresh, disabled = false }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh);
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  refreshRef.current = onRefresh;
  disabledRef.current = disabled;

  useEffect(() => {
    let gesture = null;
    let releaseTimer = null;
    let frame = null;
    let queued = null;
    let disposed = false;
    const root = document.documentElement;

    function clearPending() {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    }

    function clearSurface() {
      clearPending();
      root.classList.remove('gym-pull-active');
      root.style.removeProperty('--gym-pull-offset');
      root.style.removeProperty('--gym-pull-transition');
    }

    function offset(distance, animate = false) {
      clearPending();
      root.style.setProperty('--gym-pull-transition', animate ? `${RELEASE_DURATION_MS}ms` : '0ms');
      root.style.setProperty('--gym-pull-offset', `${Math.max(0, distance)}px`);
      root.classList.add('gym-pull-active');
    }

    function cancelFrame() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      queued = null;
    }

    function showPull(distance) {
      queued = distance;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const next = queued ?? 0;
        queued = null;
        offset(next);
        setPull(next);
      });
    }

    function returnToTop() {
      cancelFrame();
      offset(0, true);
      releaseTimer = window.setTimeout(clearSurface, RELEASE_DURATION_MS + 40);
      setPull(0);
    }

    function handleStart(event) {
      gesture = null;
      if (busyRef.current || disabledRef.current || event.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
      if (!scrollIsAtTop(event.target)) return;
      const touch = event.touches[0];
      const screen = event.target.closest('.sportpit-detail-screen,.sportpit-stack,.nutrition-screen,.phone,.exercise-phone,.statistics-phone,.account-screen,.settings-screen,.menu-screen,.create-program-phone');
      if (!screen) return;
      const rect = screen.getBoundingClientRect();
      if (touch.clientX < rect.left + 50) return; // the left edge is reserved for back navigation
      clearPending();
      gesture = { x: touch.clientX, y: touch.clientY, direction: null, deltaY: 0 };
    }

    function handleMove(event) {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.direction) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        gesture.direction = dy > 0 && dy > Math.abs(dx) * 1.25 ? 'refresh' : 'other';
      }
      if (gesture.direction !== 'refresh') return;
      if (event.cancelable) event.preventDefault();
      gesture.deltaY = Math.max(0, dy);
      showPull(Math.min(MAX_VISUAL_PULL, gesture.deltaY / PULL_REFRESH_THRESHOLD * MAX_VISUAL_PULL));
    }

    function handleEnd() {
      if (!gesture) return;
      const current = gesture;
      gesture = null;
      cancelFrame();
      if (current.direction !== 'refresh') return;
      if (current.deltaY < PULL_REFRESH_THRESHOLD) {
        returnToTop();
        return;
      }
      busyRef.current = true;
      offset(HOLD_OFFSET, true);
      setPull(HOLD_OFFSET);
      setRefreshing(true);
      Promise.resolve().then(() => refreshRef.current()).catch(error => {
        console.error('Unable to refresh current screen:', error);
      }).finally(() => {
        if (disposed) return;
        setRefreshing(false);
        busyRef.current = false;
        returnToTop();
      });
    }

    function handleCancel() {
      if (gesture?.direction === 'refresh' && !busyRef.current) returnToTop();
      gesture = null;
      cancelFrame();
    }

    document.addEventListener('touchstart', handleStart, { passive: true });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd, { passive: true });
    document.addEventListener('touchcancel', handleCancel, { passive: true });
    return () => {
      disposed = true;
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleCancel);
      cancelFrame();
      clearSurface();
    };
  }, []);

  const progress = pull / MAX_VISUAL_PULL;
  // Keep the status panel at the front of the viewport, above every screen
  // and above the held page throughout the refresh.
  const y = refreshing ? 12 : -54 + pull * .67;
  return <div className={`pull-refresh-indicator${refreshing ? ' refreshing' : ''}`}
    style={{ transform: `translate3d(-50%,${y}px,0)`, opacity: refreshing ? 1 : progress }}
    role="status" aria-live="polite" aria-label={refreshing ? 'Обновление экрана' : undefined}>
    <span className="pull-refresh-wheel" style={{ transform: `rotate(${Math.round(progress * 260)}deg)` }} />
    <span className="pull-refresh-label">{refreshing ? 'Обновляем…' : progress === 1 ? 'Отпустите' : 'Потяните ещё'}</span>
  </div>;
}
