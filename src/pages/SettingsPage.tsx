import { useRef, useState } from 'react';
import { Copy, Download, PiggyBank, Plus, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useSettings } from '../hooks/useData';
import { exportBackup, findDuplicateShiftIds, importBackup, removeShifts, settingsRepo } from '../db/repository';
import { Card } from '../components/ui/Card';
import { Checkbox, Field, Input, Select } from '../components/ui/Field';
import { formatCurrency } from '../lib/format';
import { PageHeader } from '../components/ui/PageHeader';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function SettingsPage() {
  const settings = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  if (!settings) return null;

  const goals = settings.goals ?? [];

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(goalAmount);
    if (!goalName.trim() || !(amount > 0)) return;
    await settingsRepo.put({ ...settings!, goals: [...goals, { id: crypto.randomUUID(), name: goalName.trim(), amount }] });
    setGoalName('');
    setGoalAmount('');
  }

  async function handleExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded.');
  }

  async function handleDedupe() {
    const ids = await findDuplicateShiftIds();
    if (ids.length === 0) {
      setMessage('No duplicate shifts found.');
      return;
    }
    if (!confirm(`Found ${ids.length} duplicate shift(s) (same job, date and times). Remove the extra copies?`)) return;
    await removeShifts(ids);
    setMessage(`Removed ${ids.length} duplicate shift(s).`);
  }

  async function handleImport(file: File) {
    if (!confirm('This replaces ALL data on this device with the backup. Continue?')) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      setMessage('Backup restored.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title="Settings" />

      <Card className="space-y-3">
        <Field label="Appearance">
          <ThemeToggle />
        </Field>
      </Card>

      <Card className="space-y-4">
        <Field label="Week starts on">
          <Select
            value={settings.weekStartDay}
            onChange={(e) => settingsRepo.put({ ...settings, weekStartDay: Number(e.target.value) as 0 | 1 })}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </Select>
        </Field>

        <Field label="A date that starts one of your fortnightly pay cycles">
          <Input
            type="date"
            value={settings.fortnightAnchorDate}
            onChange={(e) => settingsRepo.put({ ...settings, fortnightAnchorDate: e.target.value })}
          />
        </Field>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Fortnight boundaries are calculated 14 days at a time from this date, so pick any date you know is the first
          day of a fortnightly pay cycle for one of your jobs.
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">Tax estimate</h2>
        <Checkbox
          label="I have a HECS/HELP debt"
          checked={Boolean(settings.hasHelpDebt)}
          onChange={(e) => settingsRepo.put({ ...settings, hasHelpDebt: e.target.checked })}
        />
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Adds the compulsory repayment (2025–26 rates: 15% of income above $67,000, 17% above $125,000) to after-tax
          estimates.
        </p>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <PiggyBank className="h-4 w-4" /> Fortnight goals
          </h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Amounts you need each fortnight (rent, bills, savings). The Dashboard shows how much of each your
            take-home pay covers, filling them in this order.
          </p>
        </div>
        {goals.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{g.name}</span>
                <span className="ml-auto tabular-nums text-slate-500 dark:text-slate-400">{formatCurrency(g.amount)}</span>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label={`Remove ${g.name}`}
                  onClick={() => settingsRepo.put({ ...settings, goals: goals.filter((x) => x.id !== g.id) })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addGoal} className="grid grid-cols-[1fr_7rem_auto] gap-2">
          <Input placeholder="e.g. Rent" value={goalName} onChange={(e) => setGoalName(e.target.value)} aria-label="Goal name" />
          <Input
            type="number"
            min="1"
            step="any"
            placeholder="$ amount"
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
            aria-label="Amount per fortnight"
          />
          <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">Backup &amp; transfer</h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Data is stored on each device. Download a backup here, then restore it on another device (e.g. phone to
            laptop) to copy all jobs and shifts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
            Download backup
          </Button>
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
            Restore from backup
          </Button>
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={handleDedupe}>
            Remove duplicate shifts
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handleImport(f);
            }}
          />
        </div>
        {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      </Card>
    </div>
  );
}
