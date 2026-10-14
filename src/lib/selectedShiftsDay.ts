import { useSyncExternalStore } from 'react';

/**
 * The date selected on the Shifts calendar, shared so the bottom bar's + button can add a
 * shift on that day. null when the Shifts page isn't open.
 */
let selectedDay: string | null = null;
const listeners = new Set<() => void>();

export function setSelectedShiftsDay(day: string | null): void {
  if (day === selectedDay) return;
  selectedDay = day;
  for (const listener of listeners) listener();
}

export function useSelectedShiftsDay(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selectedDay,
  );
}
