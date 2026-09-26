import { useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Shows a short message at the bottom of the screen, optionally with an action such as Undo. */
export function toast(message: string, action?: ToastItem['action']) {
  const id = nextId++;
  items = [...items.slice(-2), { id, message, action }];
  emit();
  setTimeout(() => dismiss(id), action ? 5000 : 2500);
}

/** A light tap on devices that support vibration (Android; iOS Safari ignores it). */
export function haptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* unsupported */
  }
}

export function Toaster() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 print:hidden bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-6"
      aria-live="polite"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in pointer-events-auto flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              className="font-semibold text-brand-300 dark:text-brand-600"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
