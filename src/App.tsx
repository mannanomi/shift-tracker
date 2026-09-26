import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Clock,
  Cloud,
  Home,
  MoreHorizontal,
  Settings as SettingsIcon,
  Timer,
} from 'lucide-react';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ensureSeeded } from './db/repository';
import { cloudEnabled } from './lib/supabase/client';
import { startSync } from './lib/supabase/sync';
import { useSession } from './hooks/useAuth';
import { Dashboard } from './pages/Dashboard';
import { ShiftsPage } from './pages/ShiftsPage';
import { JobsPage } from './pages/JobsPage';
import { ReportsPage } from './pages/ReportsPage';
import { PublicHolidaysPage } from './pages/PublicHolidaysPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountPage } from './pages/AccountPage';
import { PageHeader } from './components/ui/PageHeader';
import { AppSkeleton } from './components/ui/Skeleton';
import { Toaster } from './components/ui/Toast';
import { Modal } from './components/ui/Modal';
import { QuickAddSheet } from './components/shifts/QuickAddSheet';
import { ShiftForm } from './components/shifts/ShiftForm';

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/shifts', label: 'Shifts', Icon: Clock },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/more', label: 'More', Icon: MoreHorizontal },
];

const SIDEBAR_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: Home },
  { to: '/shifts', label: 'Shifts', Icon: Clock },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/holidays', label: 'Public holidays', Icon: CalendarDays },
  { to: '/account', label: 'Account', Icon: Cloud },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

function Splash({ message }: { message: string }) {
  return <AppSkeleton message={message} />;
}

/** Floating + button that opens one-tap Quick add (with a way through to the full form). */
function QuickAddButton() {
  const [open, setOpen] = useState(false);
  const [fullFormDate, setFullFormDate] = useState<string | null>(null);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick add shift"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform hover:bg-brand-700 active:scale-95 print:hidden bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-8 lg:right-8"
      >
        <Plus className="h-6 w-6" strokeWidth={2.4} />
      </button>
      {open && (
        <QuickAddSheet
          onClose={() => setOpen(false)}
          onMoreOptions={(date) => {
            setOpen(false);
            setFullFormDate(date);
          }}
        />
      )}
      {fullFormDate && (
        <Modal title="Add shift" onClose={() => setFullFormDate(null)}>
          <ShiftForm initialDate={fullFormDate} onDone={() => setFullFormDate(null)} />
        </Modal>
      )}
    </>
  );
}

type DataState = { userId: string | null; status: 'loading' | 'ready' | 'error'; error?: string };

/** Local-only mode (no cloud configured): seed and go. */
function useLocalReady(enabled: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (enabled) ensureSeeded().then(() => setReady(true));
  }, [enabled]);
  return ready;
}

function App() {
  const { session, loading } = useSession();
  const localReady = useLocalReady(!cloudEnabled);
  const userId = session?.user.id ?? null;
  const [data, setData] = useState<DataState>({ userId: null, status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!cloudEnabled || !userId) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    setData({ userId, status: 'loading' });
    startSync(userId)
      .then((s) => {
        if (cancelled) return s();
        stop = s;
        setData({ userId, status: 'ready' });
      })
      .catch((err) => {
        if (!cancelled) setData({ userId, status: 'error', error: err?.message ?? 'Could not load your data.' });
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [userId, attempt]);

  if (!cloudEnabled) {
    if (!localReady) return <Splash message="Loading Shift Tracker…" />;
  } else {
    if (loading) return <Splash message="Loading Shift Tracker…" />;
    if (!session) return <LoginScreen />;
    if (data.userId !== userId || data.status === 'loading') return <Splash message="Syncing your data…" />;
    if (data.status === 'error') {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center dark:bg-slate-900">
          <p className="text-sm text-red-600 dark:text-red-400">{data.error}</p>
          <button className="text-sm font-medium text-brand-600 dark:text-brand-400" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      );
    }
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col print:hidden border-r border-slate-200 bg-white px-4 py-6 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Timer className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Shift Tracker</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {SIDEBAR_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2.1} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-1 pt-4">
          <ThemeToggle />
        </div>
      </aside>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col lg:ml-64 lg:max-w-none print:ml-0">
        <main
          className="mx-auto w-full flex-1 px-4 pb-24 pt-6 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/holidays" element={<PublicHolidaysPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/more" element={<MorePage />} />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 border-t lg:hidden print:hidden border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex justify-around px-1 py-1.5">
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                  }`
                }
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
      <QuickAddButton />
      <Toaster />
      </div>
    </HashRouter>
  );
}

function LoginScreen() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 pt-16 dark:bg-slate-900">
      <div className="mx-auto mb-6 flex max-w-md items-center justify-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Timer className="h-5 w-5" />
        </span>
        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Shift Tracker</span>
      </div>
      <AccountPage />
    </div>
  );
}

function MorePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon={<MoreHorizontal className="h-5 w-5" />} title="More" />
      <div className="space-y-2.5">
        <MoreLink to="/holidays" label="Public holidays" subtitle="Manage SA public holiday dates" icon={CalendarDays} />
        <MoreLink to="/account" label="Account" subtitle="Sign in to sync across devices" icon={Cloud} />
        <MoreLink to="/settings" label="Settings" subtitle="Week start day, fortnight cycle" icon={SettingsIcon} />
      </div>
    </div>
  );
}

function MoreLink({
  to,
  label,
  subtitle,
  icon: Icon,
}: {
  to: string;
  label: string;
  subtitle: string;
  icon: typeof CalendarDays;
}) {
  return (
    <NavLink
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50 transition-colors hover:border-brand-200 hover:bg-brand-50/40 dark:border-slate-800 dark:bg-slate-800 dark:shadow-none dark:hover:border-brand-800 dark:hover:bg-slate-800/70"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </NavLink>
  );
}

export default App;
