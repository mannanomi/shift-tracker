import { CloudCheck, CloudOff, RefreshCw } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useSyncStatus } from '../../hooks/useSyncStatus';

const STYLES = {
  synced: { label: 'Synced', Icon: CloudCheck, cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' },
  syncing: { label: 'Syncing', Icon: RefreshCw, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  offline: { label: 'Offline', Icon: CloudOff, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
} as const;

/** Small status pill linking to the Account page; hidden when cloud sync isn't configured. */
export function SyncChip() {
  const { state, lastSync } = useSyncStatus();
  if (state === 'local') return null;
  const { label, Icon, cls } = STYLES[state];
  return (
    <NavLink
      to="/account"
      title={lastSync ? `Last synced ${new Date(lastSync).toLocaleString('en-AU')}` : undefined}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
      {label}
    </NavLink>
  );
}
