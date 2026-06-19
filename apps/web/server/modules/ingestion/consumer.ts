import { INGESTION_QUEUE, IngestionJob } from '@takeoff/contracts';
import { getLogger, runWithCorrelation } from '../../platform/observability';
import { getRedis } from '../../redis/client';
import { ingestSourceFile, type IngestionDeps, type IngestResult } from './pipeline';

/**
 * Ingestion queue consumer (P1-02). The worker drains jobs the API enqueued (P1-01) and runs the
 * pipeline under the job's correlation id. The queue is a Redis list (LPUSH by the producer, so we
 * RPOP for FIFO). Processing is idempotent, so at-least-once delivery is safe. A malformed message
 * is logged and dropped rather than wedging the queue.
 *
 * The standalone worker-files process (a long-running loop calling drainOne, deployed to the
 * Phase-2 compute home) is a thin wrapper around this — see STATE §6.
 */
export async function drainOne(
  deps: IngestionDeps,
  opts: { blockSeconds?: number } = {},
): Promise<IngestResult | null> {
  const redis = getRedis();
  const raw = opts.blockSeconds
    ? (await redis.brpop(INGESTION_QUEUE, opts.blockSeconds))?.[1]
    : await redis.rpop(INGESTION_QUEUE);
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    getLogger().error('dropping unparseable ingestion job', { event: 'bad_job' });
    return null;
  }

  const job = IngestionJob.safeParse(parsedJson);
  if (!job.success) {
    getLogger().error('dropping invalid ingestion job', { event: 'bad_job' });
    return null;
  }

  return runWithCorrelation(job.data.correlationId, () =>
    ingestSourceFile(deps, { orgId: job.data.orgId, sourceFileId: job.data.sourceFileId }),
  );
}
