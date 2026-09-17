/**
 * Simplified Australian resident individual income tax estimate: the 2024–25 "Stage 3" tax
 * brackets, the Low Income Tax Offset, and an approximation of the Medicare levy low-income
 * phase-in. This is a ballpark for take-home pay, not a substitute for a payslip or tax
 * return — it ignores HECS/HELP repayments, private health insurance rebate/surcharge, other
 * income, and the Medicare levy family/dependent thresholds. Brackets are not auto-indexed;
 * re-check against the current ATO rates if precision matters.
 */

interface Bracket {
  ceiling: number;
  rate: number;
  baseTax: number;
}

const BRACKETS: Bracket[] = [
  { ceiling: 18_200, rate: 0, baseTax: 0 },
  { ceiling: 45_000, rate: 0.16, baseTax: 0 },
  { ceiling: 135_000, rate: 0.3, baseTax: 4_288 },
  { ceiling: 190_000, rate: 0.37, baseTax: 31_288 },
  { ceiling: Infinity, rate: 0.45, baseTax: 51_638 },
];

const BRACKET_FLOORS = [0, 18_200, 45_000, 135_000, 190_000];

function incomeTaxFor(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  const index = BRACKETS.findIndex((b) => taxableIncome <= b.ceiling);
  const bracket = BRACKETS[index];
  return bracket.baseTax + bracket.rate * (taxableIncome - BRACKET_FLOORS[index]);
}

/** Low Income Tax Offset — reduces tax payable directly, phasing out between $37.5k–$66.7k. */
function lowIncomeTaxOffset(taxableIncome: number): number {
  if (taxableIncome <= 37_500) return 700;
  if (taxableIncome <= 45_000) return 700 - 0.05 * (taxableIncome - 37_500);
  if (taxableIncome <= 66_667) return Math.max(0, 325 - 0.015 * (taxableIncome - 45_000));
  return 0;
}

/** Approximate single-person Medicare levy: nil below ~$26k, phased in to the full 2% by ~$32.5k. */
function medicareLevy(taxableIncome: number): number {
  const LOWER_THRESHOLD = 26_000;
  const UPPER_THRESHOLD = 32_500;
  if (taxableIncome <= LOWER_THRESHOLD) return 0;
  if (taxableIncome <= UPPER_THRESHOLD) return 0.1 * (taxableIncome - LOWER_THRESHOLD);
  return 0.02 * taxableIncome;
}

export interface AnnualTaxEstimate {
  annualTaxableIncome: number;
  incomeTax: number;
  lito: number;
  medicareLevy: number;
  totalTax: number;
  netIncome: number;
}

export function estimateAnnualTax(annualTaxableIncome: number): AnnualTaxEstimate {
  const grossTax = incomeTaxFor(annualTaxableIncome);
  const lito = Math.min(grossTax, lowIncomeTaxOffset(annualTaxableIncome));
  const incomeTax = grossTax - lito;
  const levy = medicareLevy(annualTaxableIncome);
  const totalTax = incomeTax + levy;
  return {
    annualTaxableIncome,
    incomeTax,
    lito,
    medicareLevy: levy,
    totalTax,
    netIncome: annualTaxableIncome - totalTax,
  };
}

export interface PeriodTaxEstimate {
  periodGrossIncome: number;
  periodTax: number;
  periodNetIncome: number;
  annual: AnnualTaxEstimate;
}

/**
 * Estimates take-home pay for one pay period by annualizing the period's gross income,
 * taxing the annualized amount, then dividing the tax back down — the same approach the
 * ATO's own PAYG withholding formulas use, so it tracks real take-home pay reasonably well
 * even though actual per-paycheck withholding depends on each employer's own calculation.
 */
export function estimateNetForPeriod(periodGrossIncome: number, periodsPerYear: number): PeriodTaxEstimate {
  const annual = estimateAnnualTax(periodGrossIncome * periodsPerYear);
  const periodTax = annual.totalTax / periodsPerYear;
  return {
    periodGrossIncome,
    periodTax,
    periodNetIncome: periodGrossIncome - periodTax,
    annual,
  };
}
