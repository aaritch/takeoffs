import type { ReportTemplate } from '@takeoff/contracts';
import { totalExtendedCostMinor, type ReportData } from './render';

/**
 * Export-vs-rollup parity check (P1-14 · GATE). Re-parses the numbers out of a RENDERED export and
 * reconciles every one against the authoritative {@link ReportData} (which is read straight from the
 * QuantityRollup). This guards the whole chain rollup → data → render: a renderer that recomputed,
 * rounded, or dropped a value is caught here, before the export reaches a user.
 *
 * Quantities are compared at FULL precision (exact equality) — the export must not display-round.
 * Money is integer cents, so the 2-dp dollar cell reconciles losslessly back to minor units. The
 * check compares pre-rounding values, per the caveat, so it never raises a false mismatch on a
 * legitimately-formatted number while still catching a real one.
 */

export interface ParityMismatch {
  label: string; // condition name, or 'TOTAL'
  field: 'quantity' | 'extendedCost';
  expected: number | null;
  found: number | null;
}

interface TemplateColumns {
  conditionCol: number;
  quantityCol: number;
  extendedCostCol: number;
}

/** Where each data template puts the condition name, its quantity, and its extended cost. */
const COLUMNS: Record<Exclude<ReportTemplate, 'MARKED_PLANS'>, TemplateColumns> = {
  SUMMARY: { conditionCol: 0, quantityCol: 4, extendedCostCol: 7 },
  DETAILED: { conditionCol: 2, quantityCol: 6, extendedCostCol: 11 },
  BY_TRADE: { conditionCol: 1, quantityCol: 4, extendedCostCol: 5 },
};

/** Parse a CSV (no embedded newlines in report cells) into rows of string cells. */
function parseCsv(csv: string): string[][] {
  return csv.split('\n').map((line) => line.split(','));
}

/** A 2-dp dollar cell → integer minor units; an empty cell → null (no cost). */
function dollarsToMinor(cell: string | undefined): number | null {
  if (cell === undefined || cell.trim() === '') return null;
  return Math.round(Number.parseFloat(cell) * 100);
}

/**
 * Reconcile a rendered export against the authoritative data. Returns every mismatch found (empty
 * array ⇒ the export reconciles exactly). MARKED_PLANS has no numeric CSV body, so it has no parity
 * surface here.
 */
export function checkParity(
  template: Exclude<ReportTemplate, 'MARKED_PLANS'>,
  csv: string,
  data: ReportData,
): ParityMismatch[] {
  const cols = COLUMNS[template];
  const expectedByName = new Map(data.rows.map((r) => [r.conditionName, r]));
  const mismatches: ParityMismatch[] = [];

  for (const cells of parseCsv(csv)) {
    const name = cells[cols.conditionCol];
    const row = name !== undefined ? expectedByName.get(name) : undefined;
    if (!row) continue; // header / TOTAL / Subtotal / unrelated line

    const foundQty = Number(cells[cols.quantityCol]);
    if (!Object.is(foundQty, row.baseQuantity)) {
      mismatches.push({
        label: name!,
        field: 'quantity',
        expected: row.baseQuantity,
        found: foundQty,
      });
    }

    const foundCost = dollarsToMinor(cells[cols.extendedCostCol]);
    if (foundCost !== (row.extendedCostMinor ?? null)) {
      mismatches.push({
        label: name!,
        field: 'extendedCost',
        expected: row.extendedCostMinor ?? null,
        found: foundCost,
      });
    }
  }

  // The grand total must reconcile to the summed rollup cost (cost lives at extendedCostCol).
  const totalRow = parseCsv(csv).find((r) => r[0] === 'TOTAL');
  const expectedTotal = totalExtendedCostMinor(data.rows);
  const foundTotal = totalRow ? (dollarsToMinor(totalRow[cols.extendedCostCol]) ?? 0) : null;
  if (foundTotal !== expectedTotal) {
    mismatches.push({
      label: 'TOTAL',
      field: 'extendedCost',
      expected: expectedTotal,
      found: foundTotal,
    });
  }

  return mismatches;
}

/** Throw if a rendered export does not reconcile to the rollups (the gate's hard failure). */
export function assertExportParity(
  template: Exclude<ReportTemplate, 'MARKED_PLANS'>,
  csv: string,
  data: ReportData,
): void {
  const mismatches = checkParity(template, csv, data);
  if (mismatches.length > 0) {
    const detail = mismatches
      .map((m) => `${m.label}/${m.field}: expected ${m.expected}, exported ${m.found}`)
      .join('; ');
    throw new Error(`Export does not match the authoritative rollup: ${detail}`);
  }
}
