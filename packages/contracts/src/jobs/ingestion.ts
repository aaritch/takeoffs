import { z } from 'zod';
import { Traceable } from '../observability';

/**
 * Ingestion job — enqueued by the API once a SourceFile's bytes are safely in storage and
 * verified (P1-01), and drained by worker-files (P1-02+). Carries the correlation id so the
 * whole upload→ingest flow is followable across the broker. Idempotent: re-running for the same
 * source file replaces/derives its artifacts, never duplicates (spec §10.5).
 */

/** Redis queue name the API produces to and worker-files consumes from. */
export const INGESTION_QUEUE = 'jobs:ingestion';

export const IngestionJob = Traceable.extend({
  sourceFileId: z.string().uuid(),
  planSetId: z.string().uuid(),
  orgId: z.string().uuid(),
  storageKey: z.string().min(1),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type IngestionJob = z.infer<typeof IngestionJob>;
