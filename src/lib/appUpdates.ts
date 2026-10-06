import { registerSW } from 'virtual:pwa-register';
import { toast } from '../components/ui/Toast';

const HOUR_MS = 60 * 60 * 1000;

/** A form, sheet or dialog is open — reloading now could lose what's being typed. */
function isBusy(): boolean {
  return Boolean(document.querySelector('.fixed.inset-0'));
}

/**
 * Keeps the installed app on the latest version. An installed app otherwise keeps running the
 * copy it already has until it's fully closed (often twice), so it checks for a new version on
 * launch, whenever it comes back to the foreground, and hourly while open, then switches over —
 * straight away when nothing is open, or from an Update button when a form is in progress.
 */
export function setupAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      const apply = () => void updateSW(true);
      if (isBusy()) toast('A new version of Shiftly is ready', { label: 'Update', onClick: apply });
      else apply();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, HOUR_MS);
    },
  });
}
