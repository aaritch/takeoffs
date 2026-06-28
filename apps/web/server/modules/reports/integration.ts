import type { IntegrationFormat } from '@takeoff/contracts';
import {
  csvRow,
  money,
  totalExtendedCostMinor,
  type ReportConditionRow,
  type ReportData,
} from './render';

/**
 * Integration exports (spec §8, P4-08) — structured, VERSION-PINNED interchange exports that carry a
 * takeoff's quantities into estimating/accounting tools. Numbers come STRAIGHT from the authoritative
 * `ReportData` (the same scale-gated rollups the reports use), so an integration export equals the
 * rollups by construction — it never recomputes a quantity (the P1-13/P1-14 parity principle).
 *
 * The format VERSION is part of the format id because target formats drift between versions (the
 * caveat): we pin to a documented layout and reject malformed/partial data up front rather than
 * emitting a file a target tool would silently import wrong.
 */

/** Pinned format versions (see docs/api-reference/integration-exports.md). */
export const FORMAT_VERSIONS: Readonly<Record<IntegrationFormat, string>> = {
  ESTIMATING_CSV_V1: '1.0',
  ACCOUNTING_JSON_V1: '1.0',
};

const CURRENCY = 'USD';

export class IntegrationExportError extends Error {
  readonly code = 'EXPORT_NOT_EXPORTABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationExportError';
  }
}

export interface RenderedIntegrationExport {
  content: string;
  contentType: string;
  fileName: string;
  formatVersion: string;
}

/**
 * Reject malformed or partial data BEFORE producing any bytes, with a clear message — never emit a
 * file a target tool would import as corrupt (the caveat). A quantity must be a finite, non-negative
 * number, and every row must carry the fields a line item needs.
 */
export function assertExportable(data: ReportData): void {
  if (data.rows.length === 0) {
    throw new IntegrationExportError('Nothing to export: the takeoff has no conditions.');
  }
  for (const r of data.rows) {
    const where = `condition "${r.conditionName || r.conditionId}"`;
    if (!r.conditionName) throw new IntegrationExportError(`Missing condition name for ${where}.`);
    if (!r.unit) throw new IntegrationExportError(`Missing unit for ${where}.`);
    if (!r.measurementType)
      throw new IntegrationExportError(`Missing measurement type for ${where}.`);
    for (const [label, value] of [
      ['quantity', r.baseQuantity],
      ['quantity with waste', r.quantityWithWaste],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new IntegrationExportError(`Invalid ${label} (${value}) for ${where}.`);
      }
    }
    if (r.extendedCostMinor != null && !Number.isInteger(r.extendedCostMinor)) {
      throw new IntegrationExportError(`Non-integer extended cost for ${where}.`);
    }
  }
}

/** Stable trade ordering for groupings: by sort order, then division, then name. */
function byTrade(a: ReportConditionRow, b: ReportConditionRow): number {
  return (
    a.tradeSortOrder - b.tradeSortOrder ||
    a.tradeDivision.localeCompare(b.tradeDivision) ||
    a.tradeName.localeCompare(b.tradeName)
  );
}

/** ESTIMATING_CSV_V1: a clean columnar CSV (header + line items, grouped by trade), no preamble. */
function renderEstimatingCsv(data: ReportData): string {
  const rows = [...data.rows].sort(byTrade);
  const lines = [
    csvRow([
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
    ]),
  ];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.tradeDivision,
        r.tradeName,
        r.conditionName,
        r.measurementType,
        r.unit,
        r.baseQuantity,
        r.quantityWithWaste,
        money(r.unitCostMinor),
        money(r.extendedCostMinor),
        CURRENCY,
      ]),
    );
  }
  return lines.join('\n');
}

/** ACCOUNTING_JSON_V1: a self-describing JSON interchange with an explicit formatVersion. */
function renderAccountingJson(data: ReportData): string {
  const lineItems = [...data.rows].sort(byTrade).map((r) => ({
    division: r.tradeDivision,
    trade: r.tradeName,
    condition: r.conditionName,
    measurementType: r.measurementType,
    unit: r.unit,
    quantity: r.baseQuantity,
    quantityWithWaste: r.quantityWithWaste,
    unitCostMinor: r.unitCostMinor,
    extendedCostMinor: r.extendedCostMinor,
  }));
  return JSON.stringify(
    {
      formatVersion: FORMAT_VERSIONS.ACCOUNTING_JSON_V1,
      generator: 'takeoff-platform',
      takeoffId: data.takeoffId,
      currency: CURRENCY,
      lineItems,
      totals: {
        extendedCostMinor: totalExtendedCostMinor(data.rows),
        lineItemCount: lineItems.length,
      },
    },
    null,
    2,
  );
}

/** Validate, then render the integration export for `format`. Throws IntegrationExportError on bad data. */
export function renderIntegrationExport(
  format: IntegrationFormat,
  data: ReportData,
): RenderedIntegrationExport {
  assertExportable(data);
  const formatVersion = FORMAT_VERSIONS[format];
  switch (format) {
    case 'ESTIMATING_CSV_V1':
      return {
        content: renderEstimatingCsv(data),
        contentType: 'text/csv; charset=utf-8',
        fileName: `takeoff-${data.takeoffId}-estimating-v${formatVersion}.csv`,
        formatVersion,
      };
    case 'ACCOUNTING_JSON_V1':
      return {
        content: renderAccountingJson(data),
        contentType: 'application/json; charset=utf-8',
        fileName: `takeoff-${data.takeoffId}-accounting-v${formatVersion}.json`,
        formatVersion,
      };
  }
}
