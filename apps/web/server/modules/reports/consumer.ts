import { EXPORT_QUEUE, ExportJob } from '@takeoff/contracts';
import { getLogger, runWithCorrelation } from '../../platform/observability';
import { getRedis } from '../../redis/client';
import { generateReport, type ExportDeps, type ExportResult } from './generate';

/**
 * Export queue consumer (P1-13). The worker-exports process drains jobs the API enqueued and runs
 * generation under the job's correlation id. The queue is a Redis list (LPUSH by the producer, so
 * RPOP for FIFO). Generation is idempotent, so at-least-once delivery is safe; a malformed message
 * is logged and dropped rather than wedging the queue — mirrors the ingestion consumer.
 *
 * The standalone worker-exports process (a long-running loop calling drainExportOne, deployed to
 * the Phase-2 compute home) is a thin wrapper around this — see STATE §6.
 */
export async function drainExportOne(
  deps: ExportDeps,
  opts: { blockSeconds?: number } = {},
): Promise<ExportResult | null> {
  const redis = getRedis();
  const raw = opts.blockSeconds
    ? (await redis.brpop(EXPORT_QUEUE, opts.blockSeconds))?.[1]
    : await redis.rpop(EXPORT_QUEUE);
  if (!raw) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    getLogger().error('dropping unparseable export job', { event: 'bad_job' });
    return null;
  }

  const job = ExportJob.safeParse(parsedJson);
  if (!job.success) {
    getLogger().error('dropping invalid export job', { event: 'bad_job' });
    return null;
  }

  return runWithCorrelation(job.data.correlationId, () =>
    generateReport(deps, {
      reportId: job.data.reportId,
      takeoffId: job.data.takeoffId,
      orgId: job.data.orgId,
      template: job.data.template,
    }),
  );
}
