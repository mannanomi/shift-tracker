import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
import { LogoMark } from './components/ui/Logo';

/** Phone tab bar; the centre slot is the Quick add button. */
const NAV_LEFT = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/shifts', label: 'Shifts', Icon: Clock },
];
const NAV_RIGHT = [
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
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

/** One-tap Quick add sheet, with a way through to the full shift form. */
function QuickAddFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fullForm, setFullForm] = useState<{ date: string; jobId?: string } | null>(null);
  return (
    <>
      {open && (
        <QuickAddSheet
          onClose={onClose}
          onMoreOptions={(date, jobId) => {
            onClose();
            setFullForm({ date, jobId });
          }}
        />
      )}
      {fullForm && (
        <Modal title={fullForm.jobId ? 'Add earnings' : 'Add shift'} onClose={() => setFullForm(null)}>
          <ShiftForm
            initialDate={fullForm.date}
            template={fullForm.jobId ? { jobId: fullForm.jobId } : undefined}
            onDone={() => setFullForm(null)}
          />
        </Modal>
      )}
    </>
  );
}

function TabLink({ to, label, Icon }: { to: string; label: string; Icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition-colors ${
          isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-300 ${
              isActive ? 'animate-tab-pop bg-brand-50 dark:bg-brand-500/15' : 'bg-transparent'
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Scrolls to the top whenever the page changes, so each page opens at its beginning. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
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
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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
    if (!localReady) return <Splash message="Loading Shiftly…" />;
  } else {
    if (loading) return <Splash message="Loading Shiftly…" />;
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
      <ScrollToTop />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col print:hidden border-r border-slate-200 bg-white px-4 py-6 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <LogoMark />
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Shiftly</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {SIDEBAR_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute inset-y-2 left-0 w-1 rounded-full bg-brand-600 transition-transform duration-300 dark:bg-brand-400 ${
                      isActive ? 'scale-y-100' : 'scale-y-0'
                    }`}
                  />
                  <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" strokeWidth={2.1} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-1 pt-4">
          <ThemeToggle />
        </div>
      </aside>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col lg:ml-64 lg:max-w-none print:ml-0">
        <main
          className="stagger mx-auto w-full flex-1 px-4 pb-24 pt-6 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-10"
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
          <div className="flex items-end px-2 pt-1">
            {NAV_LEFT.map((item) => (
              <TabLink key={item.to} {...item} />
            ))}
            <div className="flex flex-1 justify-center">
              <button
                onClick={() => setQuickAddOpen(true)}
                aria-label="Quick add shift"
                className="group -mt-6 mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition duration-200 active:scale-90"
              >
                <Plus className="h-6 w-6 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
              </button>
            </div>
            {NAV_RIGHT.map((item) => (
              <TabLink key={item.to} {...item} />
            ))}
          </div>
        </nav>
      </div>
      <button
        onClick={() => setQuickAddOpen(true)}
        aria-label="Quick add shift"
        className="group fixed bottom-8 right-8 z-40 hidden h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/40 active:scale-90 lg:flex print:hidden"
      >
        <Plus className="h-6 w-6 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
      </button>
      <QuickAddFlow open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <Toaster />
      </div>
    </HashRouter>
  );
}

function LoginScreen() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 pt-16 dark:bg-slate-900">
      <div className="mx-auto mb-6 flex max-w-md items-center justify-center gap-2.5">
        <LogoMark className="h-11 w-11" />
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Shiftly</span>
      </div>
      <div className="mx-auto max-w-md">
        <AccountPage />
      </div>
    </div>
  );
}

function MorePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6">
      <PageHeader icon={<MoreHorizontal className="h-5 w-5" />} title="More" />
      <div className="space-y-2.5">
        <MoreLink to="/jobs" label="Jobs" subtitle="Pay rates, loadings and job colours" icon={Briefcase} />
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
      className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50 transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-md active:scale-[0.99] dark:border-slate-800 dark:bg-slate-800 dark:shadow-none dark:hover:border-brand-800 dark:hover:bg-slate-800/70"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 dark:text-slate-600" />
    </NavLink>
  );
}

export default App;
