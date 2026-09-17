import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Clock, DollarSign, PiggyBank, Plus, Timer, Wallet } from 'lucide-react';
import { createDefaultJob, normalizeJob, type Job } from '../../types';
import { jobsRepo } from '../../db/repository';
import { formatCurrency } from '../../lib/format';
import { Button } from '../ui/Button';
import { Checkbox, Field, Input } from '../ui/Field';

const PRESET_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

/** Rounds to cents so displayed/stored rates don't carry long float tails. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentMoreFromMultiplier(multiplier: number): number {
  return round2((multiplier - 1) * 100);
}

function multiplierFromPercentMore(percent: number): number {
  return round2(1 + percent / 100);
}

function toFormState(job?: Job): Job {
  if (!job) return createDefaultJob();
  // Older saved jobs may predate fields like nightRateMode or taxable — normalizeJob backfills
  // defaults for those ('custom' night rate mode, taxable: true) without touching what's set.
  return normalizeJob({ ...createDefaultJob(), ...job });
}

export function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
  const [form, setForm] = useState<Job>(() => toFormState(job));
  const [showOvertime, setShowOvertime] = useState(
    () => Boolean(job?.overtimeThresholdHoursPerDay || job?.overtimeThresholdHoursPerWeek),
  );
  const [showSuper, setShowSuper] = useState(() => Boolean(job?.includeSuper));

  function update<K extends keyof Job>(key: K, value: Job[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const computedNightRate =
    form.nightRateMode === 'auto' ? round2(form.morningRate * (1 + form.nightLoadingPercent / 100)) : form.nightRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await jobsRepo.put({
      ...form,
      nightRate: computedNightRate,
      updatedAt: new Date().toISOString(),
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basics */}
      <div className="space-y-4">
        <Field label="Job name">
          <Input
            required
            autoFocus
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Coffee Club"
          />
        </Field>

        <Field label="Badge color">
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update('color', c)}
                className={`h-7 w-7 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-800' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <Checkbox
            label="Cash-in-hand (don't include in tax estimate)"
            checked={!form.taxable}
            onChange={(e) => update('taxable', !e.target.checked)}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Still counted in your total income and shown on its own, but left out of the annualized income used to
            estimate tax on the Dashboard and Reports.
          </p>
        </div>
      </div>

      {/* Pay rates */}
      <Section icon={<DollarSign className="h-4 w-4" />} title="Pay rates" subtitle="Your normal hourly rate, and how night shifts are paid.">
        <Field label="Base hourly rate ($/hr)">
          <Input
            type="number"
            step="0.01"
            min="0"
            required
            value={form.morningRate || ''}
            onChange={(e) => update('morningRate', Number(e.target.value))}
            placeholder="25.00"
          />
        </Field>

        <div className="rounded-lg border border-slate-200 p-3 space-y-3 dark:border-slate-700">
          <Checkbox
            label="Auto-calculate night rate from base rate"
            checked={form.nightRateMode === 'auto'}
            onChange={(e) => update('nightRateMode', e.target.checked ? 'auto' : 'custom')}
          />

          {form.nightRateMode === 'auto' ? (
            <div className="flex items-center gap-3">
              <Field label="Night loading (%)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  className="w-28"
                  value={form.nightLoadingPercent}
                  onChange={(e) => update('nightLoadingPercent', Number(e.target.value))}
                />
              </Field>
              <p className="pt-5 text-sm text-slate-500 dark:text-slate-400">
                = <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(computedNightRate)}/hr</span> at
                night
              </p>
            </div>
          ) : (
            <Field label="Night rate ($/hr)">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.nightRate || ''}
                onChange={(e) => update('nightRate', Number(e.target.value))}
              />
            </Field>
          )}

          <Field label="Night rate applies from (shift start time)">
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                type="time"
                required
                className="pl-9"
                value={form.nightRateStartsAt}
                onChange={(e) => update('nightRateStartsAt', e.target.value)}
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* Weekend & public holiday loadings */}
      <Section
        icon={<Wallet className="h-4 w-4" />}
        title="Weekend & public holiday pay"
        subtitle="Extra pay on top of your base rate, as a percentage."
      >
        <div className="grid grid-cols-3 gap-3">
          <PercentField
            label="Saturday"
            value={percentMoreFromMultiplier(form.saturdayMultiplier)}
            onChange={(p) => update('saturdayMultiplier', multiplierFromPercentMore(p))}
          />
          <PercentField
            label="Sunday"
            value={percentMoreFromMultiplier(form.sundayMultiplier)}
            onChange={(p) => update('sundayMultiplier', multiplierFromPercentMore(p))}
          />
          <PercentField
            label="Public holiday"
            value={percentMoreFromMultiplier(form.publicHolidayMultiplier)}
            onChange={(p) => update('publicHolidayMultiplier', multiplierFromPercentMore(p))}
          />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          e.g. 50% on Saturday means time-and-a-half; 100% on Sunday means double time. Only the highest applicable
          one is used if a public holiday falls on a weekend.
        </p>

        <Field label="Casual loading (%)">
          <Input
            type="number"
            step="1"
            min="0"
            className="w-28"
            value={form.casualLoadingPercent || ''}
            onChange={(e) => update('casualLoadingPercent', Number(e.target.value))}
            placeholder="0"
          />
        </Field>
      </Section>

      {/* Live preview */}
      <RatePreview job={form} computedNightRate={computedNightRate} />

      {/* Overtime — collapsed by default */}
      <CollapsibleSection
        icon={<Timer className="h-4 w-4" />}
        title="Overtime rules"
        open={showOvertime}
        onToggle={() => setShowOvertime((v) => !v)}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="OT threshold — hours/day">
            <Input
              type="number"
              step="0.25"
              min="0"
              value={form.overtimeThresholdHoursPerDay ?? ''}
              placeholder="e.g. 8"
              onChange={(e) => update('overtimeThresholdHoursPerDay', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="OT threshold — hours/week">
            <Input
              type="number"
              step="0.25"
              min="0"
              value={form.overtimeThresholdHoursPerWeek ?? ''}
              placeholder="e.g. 38"
              onChange={(e) => update('overtimeThresholdHoursPerWeek', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Overtime tiers">
          <div className="space-y-2">
            {form.overtimeTiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 text-sm text-slate-500 dark:text-slate-400">Tier {i + 1}:</span>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  className="w-24"
                  disabled={!Number.isFinite(tier.hoursInTier) && i === form.overtimeTiers.length - 1}
                  value={Number.isFinite(tier.hoursInTier) ? tier.hoursInTier : ''}
                  placeholder={Number.isFinite(tier.hoursInTier) ? undefined : 'remaining'}
                  onChange={(e) => {
                    const tiers = [...form.overtimeTiers];
                    tiers[i] = { ...tiers[i], hoursInTier: e.target.value === '' ? Infinity : Number(e.target.value) };
                    update('overtimeTiers', tiers);
                  }}
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">hrs @</span>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  className="w-20"
                  value={tier.multiplier}
                  onChange={(e) => {
                    const tiers = [...form.overtimeTiers];
                    tiers[i] = { ...tiers[i], multiplier: Number(e.target.value) };
                    update('overtimeTiers', tiers);
                  }}
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">x</span>
                {form.overtimeTiers.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-red-500 dark:text-red-400"
                    onClick={() => update('overtimeTiers', form.overtimeTiers.filter((_, idx) => idx !== i))}
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              onClick={() =>
                update('overtimeTiers', [
                  ...form.overtimeTiers.slice(0, -1),
                  { hoursInTier: 2, multiplier: 1.5 },
                  form.overtimeTiers[form.overtimeTiers.length - 1] ?? { hoursInTier: Infinity, multiplier: 2 },
                ])
              }
            >
              <Plus className="h-3 w-3" /> Add tier
            </button>
          </div>
        </Field>
      </CollapsibleSection>

      {/* Superannuation — collapsed by default */}
      <CollapsibleSection
        icon={<PiggyBank className="h-4 w-4" />}
        title="Superannuation"
        open={showSuper}
        onToggle={() => setShowSuper((v) => !v)}
      >
        <Checkbox
          label="Include superannuation"
          checked={form.includeSuper}
          onChange={(e) => update('includeSuper', e.target.checked)}
        />
        {form.includeSuper && (
          <Field label="Super rate (%)">
            <Input
              type="number"
              step="0.1"
              min="0"
              className="w-28"
              value={form.superRatePercent}
              onChange={(e) => update('superRatePercent', Number(e.target.value))}
            />
          </Field>
        )}
      </CollapsibleSection>

      {job && (
        <Checkbox
          label="Archived (hide from new-shift picker)"
          checked={form.archived}
          onChange={(e) => update('archived', e.target.checked)}
        />
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" icon={<Check className="h-4 w-4" />}>
          Save job
        </Button>
      </div>
    </form>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <span className="text-brand-600 dark:text-brand-400">{icon}</span>
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-800 dark:text-slate-200"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-brand-600 dark:text-brand-400">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (percent: number) => void }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type="number"
          step="1"
          min="0"
          value={value || ''}
          placeholder="0"
          onChange={(e) => onChange(Number(e.target.value))}
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500">%</span>
      </div>
    </Field>
  );
}

function RatePreview({ job, computedNightRate }: { job: Job; computedNightRate: number }) {
  const casualLoaded = round2(job.morningRate * (1 + job.casualLoadingPercent / 100));
  const nightCasualLoaded = round2(computedNightRate * (1 + job.casualLoadingPercent / 100));

  const rows: { label: string; rate: number }[] = [
    { label: 'Weekday, day', rate: casualLoaded },
    { label: 'Weekday, night', rate: nightCasualLoaded },
    { label: 'Saturday', rate: round2(casualLoaded * job.saturdayMultiplier) },
    { label: 'Sunday', rate: round2(casualLoaded * job.sundayMultiplier) },
    { label: 'Public holiday', rate: round2(casualLoaded * job.publicHolidayMultiplier) },
  ];

  if (job.morningRate <= 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Your effective hourly rates</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{formatCurrency(row.rate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
