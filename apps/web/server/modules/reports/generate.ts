import type { ReportStatus, ReportTemplate } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { getLogger } from '../../platform/observability';
import type { StorageAdapter } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { buildReportData } from './data';
import { renderReport } from './render';
import { reportsRepo } from './repository';

/**
 * Report generation (P1-13) — the worker-exports unit of work, driven by an ExportJob. It renders
 * the template from the authoritative rollups, writes the artifact to org-namespaced storage, and
 * flips the Report row to READY (or FAILED with a reason). Idempotent + retriable: re-running a
 * reportId overwrites the same storage key and re-derives status, so at-least-once delivery is safe.
 */

export interface ExportDeps {
  /** The RLS-subject app database (APP_DATABASE_URL). */
  db: DB;
  storage: StorageAdapter;
}

export interface ExportJobInput {
  reportId: string;
  takeoffId: string;
  orgId: string;
  template: ReportTemplate;
}

export interface ExportResult {
  status: Extract<ReportStatus, 'READY' | 'FAILED'>;
  reason?: string;
}

const CONTENT_TYPE = 'text/csv; charset=utf-8';

async function setStatus(
  db: DB,
  orgId: string,
  reportId: string,
  patch: {
    status: ReportStatus;
    storage_key?: string;
    file_name?: string;
    file_size_bytes?: number;
    error_detail?: string | null;
  },
): Promise<void> {
  await withOrgScope(db, orgId, (tx) => reportsRepo.update(tx, reportId, patch));
}

export async function generateReport(deps: ExportDeps, job: ExportJobInput): Promise<ExportResult> {
  const { db, storage } = deps;
  const { reportId, takeoffId, orgId, template } = job;
  await setStatus(db, orgId, reportId, { status: 'GENERATING', error_detail: null });

  try {
    const data = await withOrgScope(db, orgId, (tx) => buildReportData(tx, takeoffId));
    const content = renderReport(template, data);
    const bytes = Buffer.from(content, 'utf8');
    const fileName = `${template.toLowerCase()}-${reportId}.csv`;
    const key = orgStorageKey(orgId, 'reports', reportId, fileName);
    await storage.putObject(key, bytes, CONTENT_TYPE);

    await setStatus(db, orgId, reportId, {
      status: 'READY',
      storage_key: key,
      file_name: fileName,
      file_size_bytes: bytes.byteLength,
      error_detail: null,
    });
    getLogger().info('report generated', { event: 'report_ready', reportId, template });
    return { status: 'READY' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Report generation failed';
    await setStatus(db, orgId, reportId, { status: 'FAILED', error_detail: reason });
    getLogger().error('report generation failed', { event: 'report_failed', reportId, reason });
    return { status: 'FAILED', reason };
  }
}
