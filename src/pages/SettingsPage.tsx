import { Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '../hooks/useData';
import { settingsRepo } from '../db/repository';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export function SettingsPage() {
  const settings = useSettings();
  if (!settings) return null;

  return (
    <div className="space-y-4">
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
    </div>
  );
}
