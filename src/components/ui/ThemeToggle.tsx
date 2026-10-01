import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export function ThemeToggle() {
  const [mode, setMode] = useTheme();

  /** Switches theme with the new one revealed in a circle growing from the tapped button. */
  function choose(next: ThemeMode, button: HTMLElement) {
    const doc = document as DocumentWithTransitions;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduceMotion || next === mode) {
      setMode(next);
      return;
    }
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = doc.startViewTransition(() => setMode(next));
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 550, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {
        /* transition skipped; theme is already applied */
      });
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => {
        const selected = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            onClick={(e) => choose(optionMode, e.currentTarget)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-xs font-medium transition duration-150 active:scale-95 ${
              selected
                ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
            }`}
          >
            <Icon className={`h-4 w-4 transition-transform duration-500 ${selected ? 'rotate-[360deg]' : ''}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
