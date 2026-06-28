import { describe, expect, it } from 'vitest';
import { assertExportable, renderIntegrationExport } from './integration';
import type { ReportConditionRow, ReportData } from './render';

const TAKEOFF_ID = '019f0000-0000-7000-8000-000000000001';

function row(over: Partial<ReportConditionRow>): ReportConditionRow {
  return {
    conditionId: '019f0000-0000-7000-8000-0000000000aa',
    conditionName: 'Slab on grade',
    tradeName: 'Concrete',
    tradeDivision: '03',
    tradeSortOrder: 1,
    measurementType: 'AREA',
    unit: 'SF',
    baseQuantity: 2500,
    quantityWithWaste: 2625,
    measurementCount: 1,
    derivedVolume: null,
    derivedSurfaceArea: null,
    unitCostMinor: 150,
    extendedCostMinor: 393_750,
    ...over,
  };
}

/** A two-trade takeoff (Framing sorts after Concrete) to exercise groupings + ordering. */
const DATA: ReportData = {
  takeoffId: TAKEOFF_ID,
  rows: [
    row({
      conditionName: 'Studs',
      tradeName: 'Framing',
      tradeDivision: '06',
      tradeSortOrder: 2,
      measurementType: 'COUNT',
      unit: 'EA',
      baseQuantity: 40,
      quantityWithWaste: 40,
      unitCostMinor: 300,
      extendedCostMinor: 12_000,
    }),
    row({}), // Concrete slab
  ],
};

const parseCsv = (csv: string) => csv.split('\n').map((l) => l.split(','));

describe('integration exports (P4-08)', () => {
  it('ESTIMATING_CSV_V1 renders a clean columnar CSV, grouped by trade, quantities intact', () => {
    const out = renderIntegrationExport('ESTIMATING_CSV_V1', DATA);
    expect(out.contentType).toContain('text/csv');
    expect(out.fileName).toBe(`takeoff-${TAKEOFF_ID}-estimating-v1.0.csv`);
    expect(out.formatVersion).toBe('1.0');

    const grid = parseCsv(out.content);
    expect(grid[0]).toEqual([
      'Division',
      'Trade',
      'Condition',
      'MeasurementType',
      'Unit',
      'Quantity',
      'QuantityWithWaste',
      'UnitCostUSD',
      'ExtendedCostUSD',
      'Currency',
    ]);
    // Grouped/ordered by trade: Concrete (sort 1) before Framing (sort 2).
    expect(grid[1]![1]).toBe('Concrete');
    expect(grid[2]![1]).toBe('Framing');
    // Quantities intact (straight from the rollup): the slab's 2500 SF + cost.
    expect(grid[1]![5]).toBe('2500');
    expect(grid[1]![8]).toBe('3937.50'); // extended cost in dollars
    expect(grid[1]![9]).toBe('USD');
  });

  it('ACCOUNTING_JSON_V1 produces valid, self-describing JSON that imports cleanly', () => {
    const out = renderIntegrationExport('ACCOUNTING_JSON_V1', DATA);
    expect(out.contentType).toContain('application/json');

    const doc = JSON.parse(out.content); // round-trips → importable
    expect(doc.formatVersion).toBe('1.0');
    expect(doc.takeoffId).toBe(TAKEOFF_ID);
    expect(doc.currency).toBe('USD');
    expect(doc.lineItems).toHaveLength(2);
    const slab = doc.lineItems.find((i: { condition: string }) => i.condition === 'Slab on grade');
    expect(slab).toMatchObject({ unit: 'SF', quantity: 2500, extendedCostMinor: 393_750 });
    expect(doc.totals).toEqual({ extendedCostMinor: 393_750 + 12_000, lineItemCount: 2 });
  });

  it('preserves full quantity precision (numbers equal the rollup, never recomputed)', () => {
    const fractional: ReportData = {
      takeoffId: TAKEOFF_ID,
      rows: [row({ baseQuantity: 2500.5, quantityWithWaste: 2625.25 })],
    };
    const csv = renderIntegrationExport('ESTIMATING_CSV_V1', fractional).content;
    expect(parseCsv(csv)[1]![5]).toBe('2500.5');
    const json = JSON.parse(renderIntegrationExport('ACCOUNTING_JSON_V1', fractional).content);
    expect(json.lineItems[0].quantity).toBe(2500.5);
  });

  it('rejects malformed/partial data with a clear error rather than a corrupt file', () => {
    expect(() => assertExportable({ takeoffId: TAKEOFF_ID, rows: [] })).toThrow(
      /Nothing to export/,
    );

    const bad = (over: Partial<ReportConditionRow>) => ({
      takeoffId: TAKEOFF_ID,
      rows: [row(over)],
    });
    expect(() => renderIntegrationExport('ESTIMATING_CSV_V1', bad({ baseQuantity: NaN }))).toThrow(
      /Invalid quantity/,
    );
    expect(() =>
      renderIntegrationExport('ACCOUNTING_JSON_V1', bad({ quantityWithWaste: -1 })),
    ).toThrow(/Invalid quantity with waste/);
    expect(() => renderIntegrationExport('ESTIMATING_CSV_V1', bad({ unit: '' as never }))).toThrow(
      /Missing unit/,
    );

    // The error is typed so the API can map it to 422 (not a 500 / corrupt download).
    try {
      assertExportable(bad({ baseQuantity: Infinity }));
    } catch (e) {
      expect((e as { code: string }).code).toBe('EXPORT_NOT_EXPORTABLE');
    }
  });
});
