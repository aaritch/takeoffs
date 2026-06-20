import { describe, expect, it } from 'vitest';
import {
  renderReport,
  totalExtendedCostMinor,
  type ReportConditionRow,
  type ReportData,
} from './render';

function row(over: Partial<ReportConditionRow> = {}): ReportConditionRow {
  return {
    conditionId: 'c1',
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

/** Parse a CSV string to rows of cells (no embedded newlines in these fixtures). */
function parse(csv: string): string[][] {
  return csv.split('\n').map((line) => line.split(','));
}

const data = (rows: ReportConditionRow[]): ReportData => ({ takeoffId: 't1', rows });

describe('renderReport', () => {
  it('SUMMARY: one row per condition + a grand total, quantities verbatim from the rollup', () => {
    const rows = [row(), row({ conditionName: 'Wall', extendedCostMinor: 50000 })];
    const cells = parse(renderReport('SUMMARY', data(rows)));
    expect(cells[0]).toEqual([
      'Condition',
      'Trade',
      'Type',
      'Unit',
      'Quantity',
      'Quantity with Waste',
      'Unit Cost',
      'Extended Cost',
    ]);
    // Quantity cell equals the rollup value exactly (no display rounding in exports).
    expect(cells[1]![4]).toBe('2500');
    expect(cells[1]![7]).toBe('9187.50'); // 918750 minor → dollars
    // Grand total = sum of extended costs in dollars.
    const total = cells[cells.length - 1]!;
    expect(total[0]).toBe('TOTAL');
    expect(total[7]).toBe(((918750 + 50000) / 100).toFixed(2));
  });

  it('SUMMARY: emits a fractional quantity at full precision, never rounded', () => {
    const cells = parse(renderReport('SUMMARY', data([row({ baseQuantity: 33.33333 })])));
    expect(cells[1]![4]).toBe('33.33333');
  });

  it('DETAILED: includes derived columns, leaving nulls blank', () => {
    const cells = parse(
      renderReport('DETAILED', data([row({ derivedVolume: 1250, derivedSurfaceArea: null })])),
    );
    expect(cells[0]).toContain('Derived Volume (CF)');
    expect(cells[1]![8]).toBe('1250'); // derived volume
    expect(cells[1]![9]).toBe(''); // derived surface area (null)
    expect(cells[1]![5]).toBe('2'); // measurement count
  });

  it('BY_TRADE: groups by trade with per-trade subtotals and a grand total, ordered by sort_order', () => {
    const rows = [
      row({
        conditionName: 'Drywall',
        tradeName: 'Finishes',
        tradeDivision: '09',
        tradeSortOrder: 9,
        extendedCostMinor: 20000,
      }),
      row({
        conditionName: 'Slab',
        tradeName: 'Concrete',
        tradeDivision: '03',
        tradeSortOrder: 3,
        extendedCostMinor: 30000,
      }),
      row({
        conditionName: 'Footing',
        tradeName: 'Concrete',
        tradeDivision: '03',
        tradeSortOrder: 3,
        extendedCostMinor: 10000,
      }),
    ];
    const lines = renderReport('BY_TRADE', data(rows)).split('\n');
    // Concrete (sort 3) comes before Finishes (sort 9), regardless of input order.
    expect(lines[1]).toContain('Concrete');
    expect(lines.some((l) => l.startsWith('Subtotal — Concrete,'))).toBe(true);
    const concreteSubtotal = lines.find((l) => l.startsWith('Subtotal — Concrete'))!;
    expect(concreteSubtotal.endsWith('400.00')).toBe(true); // (30000+10000)/100
    const finishesIdx = lines.findIndex((l) => l.includes('Finishes'));
    const concreteIdx = lines.findIndex((l) => l.includes('Concrete'));
    expect(concreteIdx).toBeLessThan(finishesIdx);
    expect(lines[lines.length - 1]).toBe(`TOTAL,,,,,${((20000 + 30000 + 10000) / 100).toFixed(2)}`);
  });

  it('totalExtendedCostMinor sums minor units and skips nulls', () => {
    expect(
      totalExtendedCostMinor([row({ extendedCostMinor: 100 }), row({ extendedCostMinor: null })]),
    ).toBe(100);
  });

  it('MARKED_PLANS is rejected as a CSV template (raster export)', () => {
    expect(() => renderReport('MARKED_PLANS', data([row()]))).toThrow(/MARKED_PLANS/);
  });
});
