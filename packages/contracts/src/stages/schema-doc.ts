import { zodToJsonSchema } from 'zod-to-json-schema';
import { STAGE_ORDER } from '../enums';
import { STAGE_CONTRACTS } from './contracts';

/**
 * Build the language-neutral JSON Schema document for every stage's input + output, straight from
 * the Zod `STAGE_CONTRACTS` registry (P2-01). This is the artifact the Python inference plane
 * mirrors. Deterministic (same contracts → byte-identical output), so the parity test regenerates
 * in-memory and diffs against the committed file to catch drift — the two planes can't diverge.
 *
 * Not re-exported from the package barrel: it pulls in the dev-only `zod-to-json-schema`, which the
 * runtime API/orchestration code never needs (only the generator + the parity test import this).
 */

/** The committed JSON Schema artifact, relative to the package root. */
export const STAGE_SCHEMA_FILE = 'stage-contracts.schema.json';

export interface StageSchemaEntry {
  input: unknown;
  output: unknown;
}

export function buildStageSchemaDocument(): Record<string, StageSchemaEntry> {
  const doc: Record<string, StageSchemaEntry> = {};
  for (const stage of STAGE_ORDER) {
    const { input, output } = STAGE_CONTRACTS[stage];
    doc[stage] = {
      input: zodToJsonSchema(input, { name: `${stage}Input`, target: 'jsonSchema7' }),
      output: zodToJsonSchema(output, { name: `${stage}Output`, target: 'jsonSchema7' }),
    };
  }
  return doc;
}
