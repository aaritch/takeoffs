import { newCorrelationId } from '@takeoff/observability';
import { getRedis } from '../redis/client';
import { getCurrentCorrelationId } from './observability';

/**
 * Minimal job producer (P1-01). The HTTP request path only ever ENQUEUES heavy work; an external
 * worker drains it (cross-cutting invariant — nothing long runs inline in a Vercel function).
 * Jobs are pushed onto a Redis list as JSON and stamped with the current request's correlation id
 * so the upload→ingest flow stays followable across the broker (P0-09).
 */
export async function enqueue(queue: string, payload: Record<string, unknown>): Promise<void> {
  const correlationId = getCurrentCorrelationId() ?? newCorrelationId();
  await getRedis().lpush(queue, JSON.stringify({ correlationId, ...payload }));
}
