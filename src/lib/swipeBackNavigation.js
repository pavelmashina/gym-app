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

const SCREEN_SELECTORS = [
  '.sportpit-detail-screen', '.recipe-detail-screen', '.meal-plan-detail-screen',
  '.catalog-detail-screen', '.program-detail-phone', '.create-program-phone',
  '.settings-screen', '.account-screen', '.menu-screen', '.workout-session-phone',
  '.exercise-info-screen', '.exercise-reorder-screen', '.nutrition-screen', '.phone',
].join(',');

export function isBackSwipeGesture({ startX, startY, endX, endY, screenLeft = 0 }) {
  const dx = endX - startX;
  const dy = Math.abs(endY - startY);
  return startX >= screenLeft && startX - screenLeft <= 48
    && dx >= 76 && dy <= Math.max(28, dx * 0.5);
}

export function backSwipeShouldComplete({ dx, width, elapsedMs }) {
  if (!(width > 0) || !(elapsedMs > 0) || !(dx > 0)) return false;
  return dx >= width * 0.32 || (dx >= 76 && dx / elapsedMs > 0.65);
}

function isVisible(element) {
  if (!element || !element.getClientRects().length) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function activeBackButton() {
  // A modal must close through its own action; never swipe to a screen behind it.
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(isVisible);
  if (dialogs.length) {
    const modalBack = dialogs.at(-1).querySelector('[data-swipe-back]');
    return isVisible(modalBack) && !modalBack.disabled ? modalBack : null;
  }
  const matches = [...document.querySelectorAll(BACK_SELECTORS)].filter((button) => isVisible(button) && !button.disabled);
  return matches.at(-1) ?? null;
}

function screenForBackButton(button) {
  return button?.closest(SCREEN_SELECTORS) ?? null;
}

/**
 * Interactive left-edge swipe-back. On touchmove the current page follows the
 * finger; completion invokes the exact same Back button as a tap.
 * While sportpit details are visible the parent catalog remains mounted below.
 */
export function useSwipeBackNavigation() {
  useEffect(() => {
    let drag = null;
    let ending = false;
    let cleanupTimer = null;

    function resetScreen(page, animate = false) {
      if (!page?.isConnected) return;
      if (animate) {
        page.style.transition = 'transform 240ms cubic-bezier(.22,1,.36,1)';
        page.style.transform = 'translate3d(0,0,0)';
        window.setTimeout(() => {
          if (!page.isConnected) return;
          page.style.removeProperty('transition');
          page.style.removeProperty('transform');
          page.classList.remove('swipe-back-moving');
        }, 250);
      } else {
        page.style.removeProperty('transition');
        page.style.removeProperty('transform');
        page.classList.remove('swipe-back-moving');
      }
    }

    function onStart(event) {
      if (ending || event.touches.length !== 1) return;
      drag = null;
      const button = activeBackButton();
      if (!button) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      const page = screenForBackButton(button);
      const box = page?.getBoundingClientRect();
      if (!page || !box || box.width <= 0) return;
      const finger = event.touches[0];
      const edge = finger.clientX - box.left;
      if (edge < 0 || edge > 48) return;
      drag = { page, button, x: finger.clientX, y: finger.clientY, lastX: finger.clientX, lastY: finger.clientY, start: performance.now(), width: box.width, direction: null };
    }

    function onMove(event) {
      if (!drag || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (!drag.direction) {
        if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
        drag.direction = dx > 0 && dx > Math.abs(dy) * 1.25 ? 'back' : 'scroll';
      }
      if (drag.direction !== 'back') return;
      if (event.cancelable) event.preventDefault();
      drag.lastX = touch.clientX;
      drag.lastY = touch.clientY;
      const distance = Math.min(drag.width, Math.max(0, dx));
      drag.page.classList.add('swipe-back-moving');
      drag.page.style.transition = 'none';
      drag.page.style.transform = `translate3d(${distance}px,0,0)`;
    }

    function onEnd(event) {
      if (!drag) return;
      const current = drag;
      drag = null;
      if (current.direction !== 'back' || event.changedTouches.length !== 1) {
        resetScreen(current.page, current.direction === 'back');
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch.clientX - current.x;
      const dy = Math.abs(touch.clientY - current.y);
      const elapsedMs = Math.max(1, performance.now() - current.start);
      const valid = dx > dy * 1.1;
      if (!valid || !backSwipeShouldComplete({ dx, width: current.width, elapsedMs })) {
        resetScreen(current.page, true);
        return;
      }
      ending = true;
      const page = current.page;
      let completed = false;
      function finish() {
        if (completed) return;
        completed = true;
        if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
        current.button.click();
        // Some Back actions show confirmation instead of navigating. Restore
        // the page in that case, so it never remains stuck off-screen.
        requestAnimationFrame(() => resetScreen(page));
        ending = false;
      }
      page.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      page.style.transform = `translate3d(${current.width}px,0,0)`;
      page.addEventListener('transitionend', function onTransition(e) {
        if (e.target !== page || e.propertyName !== 'transform') return;
        page.removeEventListener('transitionend', onTransition);
        finish();
      }, { once: true });
      cleanupTimer = window.setTimeout(finish, 260);
    }

    function onCancel() {
      if (drag) resetScreen(drag.page, drag.direction === 'back');
      drag = null;
    }
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
      if (drag) resetScreen(drag.page);
    };
  }, []);
}
