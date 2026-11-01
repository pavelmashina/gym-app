import { useEffect } from 'react';

const BACK_SELECTORS = [
  '.sportpit-detail-topbar > button:first-child',
  '.recipe-detail-topbar > button:first-child',
  '.account-topbar > button[aria-label^="Назад"]',
  '.settings-topbar > button[aria-label^="Назад"]',
  '.menu-screen-topbar > button[aria-label^="Назад"]',
  '.program-detail-header > button:first-child',
  '.create-program-header > button:first-child',
  '.catalog-detail-header > button:first-child',
  '.workout-session-header > button:first-child',
  '.workout-lifecycle-header > button:first-child',
].join(',');

export function isBackSwipeGesture({ startX, startY, endX, endY, screenLeft = 0 }) {
  const horizontal = endX - startX;
  const vertical = Math.abs(endY - startY);
  return startX >= screenLeft && startX - screenLeft <= 76
    && horizontal >= 76 && vertical <= Math.max(28, horizontal * 0.5);
}

function isVisible(element) {
  if (!element || !element.getClientRects().length) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function activeBackButton() {
  // Never navigate behind an open modal. Modals with a back arrow opt in.
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(isVisible);
  if (dialogs.length) {
    const button = dialogs[dialogs.length - 1].querySelector('[data-swipe-back]');
    return isVisible(button) && !button.disabled ? button : null;
  }
  const candidates = [...document.querySelectorAll(BACK_SELECTORS)].filter((button) => isVisible(button) && !button.disabled);
  return candidates[candidates.length - 1] ?? null;
}

/**
 * Calls the same back button as a tap (and therefore respects each screen's
 * own history/unsaved-changes handling), without creating parallel navigation.
 * The gesture starts at the left edge so charts and horizontal tabs stay usable.
 */
export function useSwipeBackNavigation() {
  useEffect(() => {
    let start = null;
    function onStart(event) {
      start = null;
      if (event.touches.length !== 1 || !activeBackButton()) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]')) return;
      const screen = document.querySelector('.phone,.nutrition-screen,.sportpit-screen,.account-screen,.settings-screen,.menu-screen');
      const bounds = screen?.getBoundingClientRect();
      const touch = event.touches[0];
      if (!bounds || touch.clientX < bounds.left || touch.clientX - bounds.left > 76) return;
      start = { x: touch.clientX, y: touch.clientY, left: bounds.left };
    }
    function onEnd(event) {
      const origin = start;
      start = null;
      if (!origin || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      if (!isBackSwipeGesture({ startX: origin.x, startY: origin.y, endX: touch.clientX, endY: touch.clientY, screenLeft: origin.left })) return;
      activeBackButton()?.click();
    }
    function onCancel() { start = null; }
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, []);
}
