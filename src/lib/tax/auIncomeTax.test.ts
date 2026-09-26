import { describe, expect, it } from 'vitest';
import { estimateAnnualTax, estimateNetForPeriod, helpRepayment } from './auIncomeTax';

describe('estimateAnnualTax', () => {
  it('charges no tax below the tax-free threshold', () => {
    expect(estimateAnnualTax(15_000).totalTax).toBe(0);
    expect(estimateAnnualTax(18_200).totalTax).toBe(0);
  });

  it('matches a known reference point around $45k (~$40.1k net)', () => {
    const result = estimateAnnualTax(45_000);
    // bracket tax 16%*(45000-18200)=4288, LITO at 45000 = 325, medicare 2%*45000=900
    expect(result.incomeTax).toBeCloseTo(4288 - 325);
    expect(result.medicareLevy).toBeCloseTo(900);
    expect(result.netIncome).toBeCloseTo(40_137);
  });

  it('matches a known reference point around $80k (~$63.6k net)', () => {
    const result = estimateAnnualTax(80_000);
    expect(result.netIncome).toBeCloseTo(63_612, 0);
  });

  it('applies the top marginal rate above $190k', () => {
    const result = estimateAnnualTax(200_000);
    // 51,638 + 45% * (200,000-190,000) = 56,138 income tax, no LITO, + 2% medicare levy
    expect(result.incomeTax).toBeCloseTo(56_138);
    expect(result.medicareLevy).toBeCloseTo(4_000);
  });
});

describe('estimateNetForPeriod', () => {
  it('annualizes a fortnightly amount, taxes it, and divides back down', () => {
    // $45,000/yr = ~$1,730.77 per fortnight (26 fortnights)
    const fortnightlyGross = 45_000 / 26;
    const result = estimateNetForPeriod(fortnightlyGross, 26);
    expect(result.annual.annualTaxableIncome).toBeCloseTo(45_000);
    expect(result.periodNetIncome * 26).toBeCloseTo(40_137, 0);
  });

  it('produces a lower period tax for a weekly period at the same annual income', () => {
    const annualIncome = 60_000;
    const fortnightResult = estimateNetForPeriod(annualIncome / 26, 26);
    const weeklyResult = estimateNetForPeriod(annualIncome / 52, 52);
    expect(fortnightResult.periodTax).toBeCloseTo(weeklyResult.periodTax * 2, 0);
  });
});

describe('helpRepayment', () => {
  it('is nil at or below the $67,000 threshold', () => {
    expect(helpRepayment(50_000)).toBe(0);
    expect(helpRepayment(67_000)).toBe(0);
  });

  it('charges 15c per dollar above $67,000, then 17c above $125,000', () => {
    expect(helpRepayment(77_000)).toBeCloseTo(1_500);
    expect(helpRepayment(125_000)).toBeCloseTo(8_700);
    expect(helpRepayment(135_000)).toBeCloseTo(10_400);
  });

  it('is only added to the tax estimate when the user has a HELP debt', () => {
    const without = estimateAnnualTax(90_000);
    const withHelp = estimateAnnualTax(90_000, { helpDebt: true });
    expect(without.helpRepayment).toBe(0);
    expect(withHelp.totalTax - without.totalTax).toBeCloseTo(3_450);
  });
});
