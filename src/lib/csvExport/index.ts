import { saveFile } from '../saveFile';
import type { RangeReport } from '../payCalculation/reports';

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function shiftsToCsv(report: RangeReport): string {
  const headers = [
    'Date',
    'Job',
    'Start',
    'End',
    'Worked hours',
    'Day type',
    'Loaded hourly rate',
    'Regular hours',
    'Regular pay',
    'Overtime hours',
    'Overtime pay',
    'Gross pay',
    'Super',
    'Notes',
  ];

  const rows = report.shiftLines.map(({ shift, job, breakdown }) => {
    const otHours =
      breakdown.overtimeSegments.reduce((s, seg) => s + seg.hours, 0) + breakdown.weeklyOvertimeHours;
    const otPay = breakdown.overtimePay + breakdown.weeklyOvertimePay;
    return [
      shift.date,
      job.name,
      shift.entryType === 'leave' ? 'Paid leave' : shift.entryType === 'allowance' ? 'Allowance' : shift.startTime,
      shift.endTime,
      breakdown.workedHours.toFixed(2),
      breakdown.dayTypes.join(' + '),
      breakdown.loadedHourlyRate.toFixed(2),
      breakdown.finalRegularHours.toFixed(2),
      breakdown.finalRegularPay.toFixed(2),
      otHours.toFixed(2),
      otPay.toFixed(2),
      breakdown.finalGrossPay.toFixed(2),
      breakdown.superAmount.toFixed(2),
      shift.notes,
    ];
  });

  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string): Promise<void> {
  return saveFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'Shifts');
}
