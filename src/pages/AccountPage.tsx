import { useEffect, useState, type FormEvent } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { deleteAccountAndClear, getLastSync, signOutAndClear, SYNC_EVENT, syncNow } from '../lib/supabase/sync';
import { Modal } from '../components/ui/Modal';
import { cloudEnabled, supabase } from '../lib/supabase/client';
import { useSession } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';

export function AccountPage() {
  const { session, loading } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [lastSync, setLastSync] = useState(getLastSync());
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setLastSync(getLastSync());
    window.addEventListener(SYNC_EVENT, update);
    return () => window.removeEventListener(SYNC_EVENT, update);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMessage({ text: error.message, error: true });
    } else if (mode === 'signup' && !data.session) {
      setMessage({ text: 'Check your email to confirm your account, then sign in.', error: false });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6">
      <PageHeader icon={<Cloud className="h-5 w-5" />} title="Account" />

      {!cloudEnabled && (
        <Card className="flex items-start gap-3">
          <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cloud accounts aren't configured yet, so the app runs on this device only.
          </p>
        </Card>
      )}

      {cloudEnabled && !loading && session && (
        <Card className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Signed in as</p>
          <p className="font-medium text-slate-900 dark:text-slate-100">{session.user.email}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {lastSync ? `Last synced ${new Date(lastSync).toLocaleString('en-AU')}` : 'Not synced yet'}. Changes sync
            automatically across your devices.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={syncing}
              icon={<RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />}
              onClick={async () => {
                setSyncing(true);
                await syncNow();
                setSyncing(false);
              }}
            >
              Sync now
            </Button>
            <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => signOutAndClear()}>
              Sign out
            </Button>
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-700">
            <button type="button" onClick={() => setDeleting(true)} className="text-sm font-medium text-red-600 hover:underline dark:text-red-400">
              Delete my account
            </button>
          </div>
        </Card>
      )}

      {deleting && (
        <Modal title="Delete account" onClose={() => setDeleting(false)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setDeleteError(null);
              setDeleteBusy(true);
              try {
                await deleteAccountAndClear();
              } catch (err) {
                setDeleteError(err instanceof Error ? err.message : 'Couldn’t delete the account. Try again.');
                setDeleteBusy(false);
              }
            }}
          >
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This permanently deletes your account and every job, shift and setting synced to it, on all your devices. It
              can’t be undone. Download a backup from Settings first if you want to keep a copy.
            </p>
            <Field label='Type DELETE to confirm'>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" />
            </Field>
            {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={deleteConfirm.trim().toUpperCase() !== 'DELETE' || deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {cloudEnabled && !loading && !session && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {message && (
              <p className={`text-sm ${message.error ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {message.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy} icon={mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
              <button
                type="button"
                className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setMessage(null);
                }}
              >
                {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                By creating an account you agree to the{' '}
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="underline">
                  privacy policy
                </a>
                . Pay figures are estimates — always check them against your payslip.
              </p>
            )}
          </form>
        </Card>
      )}

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        <a href="/privacy.html" target="_blank" rel="noreferrer" className="underline">
          Privacy policy
        </a>
      </p>
    </div>
  );
}
