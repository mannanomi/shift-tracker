import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const [mode, setMode] = useTheme();

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => {
        const selected = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            onClick={() => setMode(optionMode)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
              selected
                ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
