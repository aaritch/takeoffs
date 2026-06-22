/**
 * Emit the language-neutral JSON Schema for every AI pipeline stage contract (P2-01).
 *
 * Zod (in `src/stages`) is the single source of truth; this writes `stage-contracts.schema.json`,
 * the artifact the Python inference plane mirrors (it validates payloads against this exact file).
 * Run `pnpm --filter @takeoff/contracts gen:schemas` after changing a stage contract — the parity
 * test fails if the committed file is stale, so the two planes can never silently diverge.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStageSchemaDocument, STAGE_SCHEMA_FILE } from '../src/stages/schema-doc';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', STAGE_SCHEMA_FILE);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(buildStageSchemaDocument(), null, 2)}\n`, 'utf8');
console.log(`wrote ${outPath}`);
