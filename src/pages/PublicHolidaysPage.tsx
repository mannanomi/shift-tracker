import { useState } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { usePublicHolidays } from '../hooks/useData';
import { publicHolidaysRepo } from '../db/repository';
import type { PublicHoliday } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { parseDateOnly } from '../lib/dateUtils';

export function PublicHolidaysPage() {
  const holidays = usePublicHolidays();
  const [newHoliday, setNewHoliday] = useState<{ date: string; name: string }>({ date: '', name: '' });

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!newHoliday.date || !newHoliday.name) return;
    const holiday: PublicHoliday = { id: crypto.randomUUID(), date: newHoliday.date, name: newHoliday.name, state: 'SA' };
    await publicHolidaysRepo.put(holiday);
    setNewHoliday({ date: '', name: '' });
  }

  async function removeHoliday(id: string) {
    await publicHolidaysRepo.remove(id);
  }

  const sorted = [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <PageHeader icon={<CalendarDays className="h-5 w-5" />} title="Public holidays" />

      <Card>
        <form onSubmit={addHoliday} className="flex flex-wrap items-end gap-3">
          <Field label="Date">
            <Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((p) => ({ ...p, date: e.target.value }))} />
          </Field>
          <Field label="Name">
            <Input value={newHoliday.name} onChange={(e) => setNewHoliday((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Adelaide Cup Day" />
          </Field>
          <Button type="submit" icon={<Plus className="h-4 w-4" />}>
            Add
          </Button>
        </form>
      </Card>

      <Card>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {sorted.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{parseDateOnly(h.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="flex-1 text-slate-800 dark:text-slate-200">{h.name}</span>
              <Button variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeHoliday(h.id)}>
                Remove
              </Button>
            </div>
          ))}
          {sorted.length === 0 && <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No public holidays added" />}
        </div>
      </Card>
    </div>
  );
}
