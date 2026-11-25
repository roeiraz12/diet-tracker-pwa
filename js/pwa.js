// Registers sw.js and announces when a new version is waiting.
// banners.js listens for the 'app-update-available' event and shows the "רענן" banner.

let waitingWorker = null;
let reloadOnChange = false;

export function updateAvailable() { return !!waitingWorker; }

/** Activates the waiting worker; the page reloads once it takes control. */
export function applyUpdate() {
  if (!waitingWorker) { location.reload(); return; }
  reloadOnChange = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

function setWaiting(worker) {
  waitingWorker = worker;
  window.dispatchEvent(new Event('app-update-available'));
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  // Reload only after the user pressed "רענן" (not on first install's clients.claim()).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadOnChange) return;
    reloadOnChange = false;
    location.reload();
  });

  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(nw);
        });
      });
      // Check for updates when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
}
