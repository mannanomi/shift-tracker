import type { ReactNode } from 'react';

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
        {icon}
      </span>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
    </div>
  );
}
