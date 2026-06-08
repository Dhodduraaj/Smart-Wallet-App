/**
 * Exit installed PWA / mobile web app from the screen.
 *
 * history.back() inside React Router only navigates to the previous in-app route
 * (e.g. dashboard). A full navigation to exit.html leaves the SPA and can
 * close or background the app (Android HOME intent, window.close).
 */

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Leave the app: minimize/close on installed PWA, or history.back in desktop browser.
 */
export function requestPwaExit() {
  if (typeof window === 'undefined') return;

  try {
    window.close();
  } catch {
    /* blocked in tabs */
  }

  if (isStandalonePwa() || isMobileDevice()) {
    window.location.replace(`${window.location.origin}/exit.html`);
    return;
  }

  window.history.back();
}

/** @deprecated No longer needed; exit uses exit.html */
export function installPwaExitBootstrap() {
  /* intentionally empty */
}
