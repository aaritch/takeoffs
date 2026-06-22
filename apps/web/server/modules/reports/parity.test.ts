import { describe, expect, it } from 'vitest';
import { assertExportParity, checkParity } from './parity';
import { renderReport, type ReportConditionRow, type ReportData } from './render';

function row(over: Partial<ReportConditionRow> = {}): ReportConditionRow {
  return {
    conditionId: 'c',
    conditionName: 'Slab',
    tradeName: 'Concrete',
    tradeDivision: '03',
    tradeSortOrder: 3,
    measurementType: 'AREA',
    unit: 'SF',
    baseQuantity: 2500,
    quantityWithWaste: 2625,
    measurementCount: 2,
    derivedVolume: 1250,
    derivedSurfaceArea: null,
    unitCostMinor: 350,
    extendedCostMinor: 918750,
    ...over,
  };
}

// A representative takeoff: several conditions across trades, with a fractional quantity.
const data: ReportData = {
  takeoffId: 't1',
  rows: [
    row({
      conditionId: 'a',
      conditionName: 'Slab',
      baseQuantity: 2500.5,
      extendedCostMinor: 875175,
    }),
    row({
      conditionId: 'b',
      conditionName: 'Curb',
      tradeName: 'Sitework',
      tradeDivision: '31',
      tradeSortOrder: 31,
      measurementType: 'LINEAR',
      unit: 'LF',
      baseQuantity: 333.33333,
      extendedCostMinor: 41666,
    }),
    row({
      conditionId: 'd',
      conditionName: 'Doors',
      tradeName: 'Openings',
      tradeDivision: '08',
      tradeSortOrder: 8,
      measurementType: 'COUNT',
      unit: 'EA',
      baseQuantity: 12,
      unitCostMinor: null,
      extendedCostMinor: null,
    }),
  ],
};

const TEMPLATES = ['SUMMARY', 'DETAILED', 'BY_TRADE'] as const;

describe('export ↔ rollup parity (P1-14 gate)', () => {
  it('every number in every data template reconciles to the rollup, full precision', () => {
    for (const template of TEMPLATES) {
      const csv = renderReport(template, data);
      expect(checkParity(template, csv, data)).toEqual([]);
      expect(() => assertExportParity(template, csv, data)).not.toThrow();
    }
  });

  it('a fractional quantity reconciles exactly (no false mismatch on a legitimate value)', () => {
    const csv = renderReport('SUMMARY', data);
    // 333.33333 round-trips through the CSV cell unchanged.
    expect(checkParity('SUMMARY', csv, data)).toEqual([]);
  });

  it('catches a DELIBERATELY introduced rounding discrepancy in a quantity', () => {
    for (const template of TEMPLATES) {
      const csv = renderReport(template, data);
      // Display-round Curb's quantity (333.33333 → 333) the way a buggy export might.
      const tampered = csv.replace('333.33333', '333');
      const mismatches = checkParity(template, tampered, data);
      expect(mismatches).toContainEqual({
        label: 'Curb',
        field: 'quantity',
        expected: 333.33333,
        found: 333,
      });
      expect(() => assertExportParity(template, tampered, data)).toThrow(/does not match/i);
    }
  });

  it('catches a tampered extended cost (line item and the grand total)', () => {
    const csv = renderReport('SUMMARY', data);
    const tampered = csv.replace('8751.75', '9000.00'); // Slab cost 875175 → 900000
    const mismatches = checkParity('SUMMARY', tampered, data);
    expect(mismatches.some((m) => m.label === 'Slab' && m.field === 'extendedCost')).toBe(true);
  });

  it('catches a grand-total that does not sum the rollups', () => {
    const csv = renderReport('BY_TRADE', data);
    // Total = (875175 + 41666 + 0) / 100 = 9168.41; corrupt only the TOTAL line.
    const tampered = csv.replace('TOTAL,,,,,9168.41', 'TOTAL,,,,,9999.99');
    const mismatches = checkParity('BY_TRADE', tampered, data);
    expect(mismatches).toContainEqual({
      label: 'TOTAL',
      field: 'extendedCost',
      expected: 875175 + 41666,
      found: 999999,
    });
  });
});
