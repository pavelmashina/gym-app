import { useEffect, useRef, useState } from 'react';
import '../pull-to-refresh.css';

export const PULL_REFRESH_THRESHOLD = 150;
const MAX_VISUAL_PULL = 104;

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

export function PullToRefresh({ onRefresh, disabled = false }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh);
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  refreshRef.current = onRefresh;
  disabledRef.current = disabled;

  useEffect(() => {
    let start = null;
    let releaseTimer = null;

    function movePage(page, offset, animate = false) {
      if (!page?.isConnected) return;
      page.style.transition = animate ? 'transform 270ms cubic-bezier(.2,.8,.2,1)' : 'none';
      page.style.transform = offset > 0 ? `translate3d(0,${offset}px,0)` : 'translate3d(0,0,0)';
      page.classList.toggle('pull-refresh-dragging',offset > 0);
      if (!offset) {
        if (releaseTimer) clearTimeout(releaseTimer);
        releaseTimer = window.setTimeout(() => {
          if (!page.isConnected) return;
          page.style.removeProperty('transition');
          page.style.removeProperty('transform');
          page.classList.remove('pull-refresh-dragging');
        }, 300);
      }
    }
    function handleStart(event) {
      start = null;
      if (busyRef.current || disabledRef.current || event.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
      if (!scrollIsAtTop(event.target)) return;
      const touch = event.touches[0];
      const screen = event.target.closest('.sportpit-detail-screen,.sportpit-stack,.nutrition-screen,.phone,.exercise-phone,.statistics-phone,.account-screen,.settings-screen,.menu-screen,.create-program-phone');
      if (!screen) return;
      const rect = screen.getBoundingClientRect();
      if (touch.clientX < rect.left + 50) return; // reserve the edge for swipe-back
      start = { x: touch.clientX, y: touch.clientY, direction: null, deltaY: 0, screen };
    }
    function handleMove(event) {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!start.direction) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        start.direction = dy > 0 && dy > Math.abs(dx) * 1.25 ? 'refresh' : 'other';
      }
      if (start.direction !== 'refresh') return;
      if (event.cancelable) event.preventDefault();
      start.deltaY = Math.max(0, dy);
      const distance = Math.min(MAX_VISUAL_PULL, start.deltaY / PULL_REFRESH_THRESHOLD * MAX_VISUAL_PULL);
      movePage(start.screen, distance);
      setPull(distance);
    }
    function handleEnd() {
      if (!start) return;
      const current = start;
      start = null;
      if (current.direction !== 'refresh' || current.deltaY < PULL_REFRESH_THRESHOLD) {
        movePage(current.screen, 0, true);
        setPull(0);
        return;
      }
      movePage(current.screen, 76, true);
      busyRef.current = true;
      setPull(MAX_VISUAL_PULL);
      setRefreshing(true);
      Promise.resolve().then(() => refreshRef.current()).catch((err) => {
        console.error('Unable to refresh current screen', err);
      }).finally(() => {
        setRefreshing(false);
        movePage(current.screen, 0, true);
        setPull(0);
        busyRef.current = false;
      });
    }
    function handleCancel() {
      if (start?.screen) movePage(start.screen, 0, true);
      start = null;
      if (!busyRef.current) setPull(0);
    }
    document.addEventListener('touchstart', handleStart, { passive:true });
    document.addEventListener('touchmove', handleMove, { passive:false });
    document.addEventListener('touchend', handleEnd, { passive:true });
    document.addEventListener('touchcancel', handleCancel, { passive:true });
    return () => {
      document.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleCancel);
      if (releaseTimer) clearTimeout(releaseTimer);
      if (start?.screen) {
        start.screen.style.removeProperty('transform');
        start.screen.style.removeProperty('transition');
        start.screen.classList.remove('pull-refresh-dragging');
      }
    };
  }, []);

  const progress = pull / MAX_VISUAL_PULL;
  const y = refreshing ? 18 : -54 + pull * .7;
  return <div className={`pull-refresh-indicator${refreshing ? ' refreshing' : ''}`}
    style={{ transform: `translate3d(-50%,${y}px,0)`,opacity:refreshing ? 1 : progress }}
    role="status" aria-live="polite" aria-label={refreshing ? 'Обновление экрана' : undefined}>
    <span className="pull-refresh-wheel" style={{ transform: `rotate(${Math.round(progress * 260)}deg)` }} />
    <span className="pull-refresh-label">{refreshing ? 'Обновляем…' : progress === 1 ? 'Отпустите' : 'Потяните ещё'}</span>
  </div>;
}
