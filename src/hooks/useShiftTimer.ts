import { useEffect, useState } from 'react';

const KEY = 'shift-tracker-active-timer';
const EVENT = 'shift-tracker-timer';

export interface ActiveTimer {
  jobId: string;
  /** ISO timestamp the shift started. */
  startedAt: string;
}

function read(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveTimer) : null;
  } catch {
    return null;
  }
}

function write(timer: ActiveTimer | null) {
  try {
    if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: timer lasts for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The running shift timer on this device (kept in localStorage so it survives closing the app). */
export function useShiftTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(read);

  useEffect(() => {
    const update = () => setTimer(read());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return {
    timer,
    start: (jobId: string) => write({ jobId, startedAt: new Date().toISOString() }),
    stop: () => write(null),
  };
}

/** Re-renders every `ms` milliseconds while `active`. */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}
