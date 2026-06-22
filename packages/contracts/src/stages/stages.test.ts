import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STAGE_ORDER } from '../enums';
import { STAGE_CONTRACTS } from './contracts';
import { buildStageSchemaDocument, STAGE_SCHEMA_FILE } from './schema-doc';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtures = JSON.parse(readFileSync(join(pkgRoot, 'stage-fixtures.json'), 'utf8')) as Record<
  string,
  { output: unknown }
>;

describe('AI stage contracts (P2-01)', () => {
  it('every stage fixture output validates against its Zod output contract', () => {
    for (const stage of STAGE_ORDER) {
      const result = STAGE_CONTRACTS[stage].output.safeParse(fixtures[stage]!.output);
      expect(result.success, `${stage} output should validate`).toBe(true);
    }
  });

  it('rejects a stage output missing a required field (before the next stage runs)', () => {
    // CONFIDENCE candidate without its final score.
    const candidate = {
      ...(fixtures.CONFIDENCE!.output as { candidates: Record<string, unknown>[] }).candidates[0],
    };
    delete candidate.aiConfidence;
    expect(STAGE_CONTRACTS.CONFIDENCE.output.safeParse({ candidates: [candidate] }).success).toBe(
      false,
    );

    // A non-null SCALE candidate missing unit_per_pixel is rejected (null scale is allowed).
    expect(
      STAGE_CONTRACTS.SCALE.output.safeParse({
        scale: { scaleUnits: 'IMPERIAL', source: 'NOTATION', confidence: 0.8 },
      }).success,
    ).toBe(false);
    expect(STAGE_CONTRACTS.SCALE.output.safeParse({ scale: null }).success).toBe(true);
  });

  it('rejects geometry that is not a valid MeasurementGeometry (shared coordinate seam)', () => {
    const bad = {
      lines: [
        {
          geometry: { type: 'POLYLINE', points: [{ x: 0, y: 0 }] },
          objectClass: 'wall',
          confidence: 0.5,
        },
      ],
    };
    // A polyline needs ≥2 points — the same rule manual measurements enforce.
    expect(STAGE_CONTRACTS.LINES.output.safeParse(bad).success).toBe(false);
  });

  it('the committed JSON Schema artifact is in sync with the Zod contracts (no drift)', () => {
    const committed = JSON.parse(readFileSync(join(pkgRoot, STAGE_SCHEMA_FILE), 'utf8'));
    expect(buildStageSchemaDocument()).toEqual(committed);
  });
});
