import type { RangeReport } from './payCalculation/reports';
import { buildPayBreakdown } from './payBreakdown';
import { formatCurrency, formatHours } from './format';
import { parseDateOnly } from './dateUtils';
import { saveFile } from './saveFile';

const BRAND: [number, number, number] = [37, 99, 235];
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const OVERTIME_FILL: [number, number, number] = [255, 247, 237];
const MARGIN = 14;

type DocWithTable = { lastAutoTable?: { finalY?: number } };
type CellData = { section: 'head' | 'body' | 'foot'; column: { index: number }; cell: { styles: { halign?: string } } };

/** Right-aligns the given numeric columns in the heading and total rows too, so they line up with the figures. */
function alignNumbers(columns: number[]) {
  return (data: CellData) => {
    if (columns.includes(data.column.index)) data.cell.styles.halign = 'right';
  };
}

function shortDate(date: string): string {
  return parseDateOnly(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Builds the period's pay report as a PDF: per employer, hours at base rate, night loading,
 * Saturday, Sunday, public holiday and overtime, each with its rate and amount, then every
 * shift. The PDF library is loaded only when a report is made.
 */
export async function createPayReportPdf(report: RangeReport, periodLabel: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { sections, shifts } = buildPayBreakdown(report);
  const lastY = () => (doc as unknown as DocWithTable).lastAutoTable?.finalY ?? MARGIN;
  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= pageHeight - 20) return y;
    doc.addPage();
    return MARGIN + 6;
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('Pay report', MARGIN, 22);
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text('Shiftly', pageWidth - MARGIN, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    `${periodLabel}  ·  Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    MARGIN,
    29,
  );

  // Summary
  autoTable(doc, {
    startY: 35,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    head: [['Total earned', 'Hours', 'Shifts', 'Super']],
    body: [[formatCurrency(report.totalGrossPay), formatHours(report.totalHours), String(report.shiftLines.length), formatCurrency(report.totalSuper)]],
    headStyles: { fontSize: 9, textColor: MUTED, fontStyle: 'normal', cellPadding: { top: 3, bottom: 0, left: 3, right: 3 } },
    bodyStyles: { fontSize: 14, textColor: INK, fontStyle: 'bold', cellPadding: { top: 1, bottom: 3, left: 3, right: 3 } },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.3,
  });
  let y = lastY() + 5;
  const split = [
    report.taxableGrossPay > 0 && `Wages ${formatCurrency(report.taxableGrossPay)}`,
    report.nonTaxableGrossPay > 0 && `Cash ${formatCurrency(report.nonTaxableGrossPay)}`,
    report.abnGrossPay > 0 && `ABN ${formatCurrency(report.abnGrossPay)}`,
  ].filter(Boolean);
  if (split.length > 1) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(split.join('   ·   '), MARGIN, y);
    y += 4;
  }

  // One section per employer
  for (const section of sections) {
    y = ensureSpace(y + 6, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(section.title, MARGIN, y);
    if (section.subtitle) {
      const titleWidth = doc.getTextWidth(section.title);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(section.subtitle, MARGIN + titleWidth + 3, y);
    }

    if (section.kind === 'abn') {
      autoTable(doc, {
        startY: y + 3,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Date', 'Hours', 'Amount']],
        body: section.entries.map((e) => [shortDate(e.date), e.hours > 0 ? formatHours(e.hours) : '—', formatCurrency(e.amount)]),
        foot: [['Total', formatHours(section.totalHours), formatCurrency(section.totalPay)]],
        headStyles: { fillColor: BRAND },
        footStyles: { fillColor: [241, 245, 249], textColor: INK },
        styles: { fontSize: 9.5 },
        didParseCell: alignNumbers([1, 2]),
      });
      y = lastY() + 4;
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text('ABN income: no tax was withheld and no super applies.', MARGIN, y);
      y += 2;
      continue;
    }

    const overtimeRows = new Set(section.rows.flatMap((r, i) => (r.overtime ? [i] : [])));
    autoTable(doc, {
      startY: y + 3,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Hours worked as', 'Hours', 'Rate', 'Amount']],
      body: section.rows.map((r) => [r.label, formatHours(r.hours), `${formatCurrency(r.rate)}/hr`, formatCurrency(r.amount)]),
      foot: [['Total', formatHours(section.totalHours), '', formatCurrency(section.totalPay)]],
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [241, 245, 249], textColor: INK },
      styles: { fontSize: 9.5 },
      didParseCell: (data) => {
        alignNumbers([1, 2, 3])(data);
        if (data.section === 'body' && overtimeRows.has(data.row.index)) data.cell.styles.fillColor = OVERTIME_FILL;
      },
    });
    y = lastY() + 4;
    if (section.superRatePercent != null) {
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(
        `Super (${section.superRatePercent}% on ordinary hours, not overtime): ${formatCurrency(section.superAmount)}`,
        MARGIN,
        y,
      );
      y += 2;
    }
  }

  // Every shift
  y = ensureSpace(y + 8, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('Shifts', MARGIN, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'Job', 'Time', 'Hours', 'Amount']],
    body: shifts.map((s) => [shortDate(s.date), s.job, s.overtime ? `${s.time}  (OT)` : s.time, s.hours > 0 ? formatHours(s.hours) : '—', formatCurrency(s.amount)]),
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 9 },
    didParseCell: alignNumbers([3, 4]),
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Calculated by Shiftly from your shifts and job settings. Compare with your payslip.', MARGIN, pageHeight - 8);
    doc.text(`Page ${p} of ${pages}`, pageWidth - MARGIN, pageHeight - 8, { align: 'right' });
  }

  return { doc, fileName: `shiftly-pay-report-${report.startDate}-to-${report.endDate}.pdf` };
}

/** Makes the report and lets the user keep it: the share sheet on a phone (Files, AirDrop, email), a download elsewhere. */
export async function downloadPayReport(report: RangeReport, periodLabel: string): Promise<void> {
  const { doc, fileName } = await createPayReportPdf(report, periodLabel);
  await saveFile(fileName, doc.output('blob'), 'Pay report');
}
