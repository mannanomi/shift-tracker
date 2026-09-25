import { useRef, useState } from 'react';
import { Download, Settings as SettingsIcon, Upload } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useSettings } from '../hooks/useData';
import { exportBackup, importBackup, settingsRepo } from '../db/repository';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function SettingsPage() {
  const settings = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!settings) return null;

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
