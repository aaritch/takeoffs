import type { ModelVersionView } from '@takeoff/contracts';
import type { ModelVersion } from './repository';

export function modelVersionToView(row: ModelVersion): ModelVersionView {
  return {
    id: row.id,
    modelFamily: row.model_family,
    version: row.version,
    status: row.status,
    metrics: row.metrics,
    benchmarkId: row.benchmark_id,
    previousActiveId: row.previous_active_id,
    activatedAt: row.activated_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
