import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Clock,
  Home,
  MoreHorizontal,
  Settings as SettingsIcon,
  Timer,
} from 'lucide-react';
import { ensureSeeded } from './db/repository';
import { Dashboard } from './pages/Dashboard';
import { ShiftsPage } from './pages/ShiftsPage';
import { JobsPage } from './pages/JobsPage';
import { ReportsPage } from './pages/ReportsPage';
import { PublicHolidaysPage } from './pages/PublicHolidaysPage';
import { SettingsPage } from './pages/SettingsPage';
import { PageHeader } from './components/ui/PageHeader';

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/shifts', label: 'Shifts', Icon: Clock },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/jobs', label: 'Jobs', Icon: Briefcase },
  { to: '/more', label: 'More', Icon: MoreHorizontal },
];

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureSeeded().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
        <Timer className="h-8 w-8 animate-pulse text-brand-500" />
        <p className="text-sm font-medium">Loading Shift Tracker…</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-slate-50 dark:bg-slate-900">
        <main className="flex-1 px-4 pb-24 pt-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/holidays" element={<PublicHolidaysPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/more" element={<MorePage />} />
          </Routes>
        </main>

        <nav className="fixed bottom-0 left-1/2 w-full max-w-2xl -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-800 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80"
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
    </HashRouter>
  );
}

function MorePage() {
  return (
    <div className="space-y-4">
      <PageHeader icon={<MoreHorizontal className="h-5 w-5" />} title="More" />
      <div className="space-y-2.5">
        <MoreLink to="/holidays" label="Public holidays" subtitle="Manage SA public holiday dates" icon={CalendarDays} />
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
