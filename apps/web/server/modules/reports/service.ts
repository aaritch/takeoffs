import type { ReportTemplate, ReportView } from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import type { StorageAdapter } from '../../storage';
import { assertKeyInOrg } from '../../storage/keys';
import { takeoffsRepo } from '../takeoffs/repository';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { meteringService } from '../billing';
import { reportsRepo, type Report } from './repository';

export interface RequestReportInput {
  takeoffId: string;
  template: ReportTemplate;
}

export const reportsService = {
  /**
   * Create a report in QUEUED state. The caller enqueues the ExportJob AFTER the tx commits so the
   * worker never races ahead of the row. MARKED_PLANS (a raster export) isn't supported yet.
   */
  async requestReport(tx: OrgScopedTx, input: RequestReportInput): Promise<Report> {
    if (input.template === 'MARKED_PLANS') {
      throw ValidationFailed('Marked-plans export is not available yet', { field: 'template' });
    }
    const takeoff = await takeoffsRepo.getById(tx, input.takeoffId);
    if (!takeoff) throw NotFound('Takeoff not found');

    const orgId = await currentOrgId(tx);
    const report = await reportsRepo.insert(tx, {
      org_id: orgId,
      takeoff_id: input.takeoffId,
      template: input.template,
      format: 'CSV',
      status: 'QUEUED',
    });
    // An export is a billable event (P4-02): metered exactly-once; exports beyond the plan quota are
    // recorded as billed overage (EXPORT policy is OVERAGE, so it's never blocked — the report row
    // IS the meterable event).
    await meteringService.meter(tx, { orgId, metric: 'EXPORT', referenceId: report.id });
    return report;
  },

  getById(tx: OrgScopedTx, id: string): Promise<Report | undefined> {
    return reportsRepo.getById(tx, id);
  },

  listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Report[]> {
    return reportsRepo.listByTakeoff(tx, takeoffId);
  },
};

/**
 * Serialize a Report to its HTTP view, minting a signed, expiring download URL only when the
 * artifact is READY. The key is guarded to the report's org before signing (defense in depth on
 * top of RLS) so a stored key can never be signed for another tenant.
 */
export async function reportToView(storage: StorageAdapter, report: Report): Promise<ReportView> {
  let downloadUrl: string | null = null;
  let downloadExpiresInSeconds: number | null = null;
  if (report.status === 'READY' && report.storage_key) {
    assertKeyInOrg(report.storage_key, report.org_id);
    const signed = await storage.getSignedDownloadUrl(report.storage_key);
    downloadUrl = signed.url;
    downloadExpiresInSeconds = signed.expiresInSeconds;
  }
  return {
    id: report.id,
    takeoffId: report.takeoff_id,
    template: report.template,
    format: report.format,
    status: report.status,
    fileName: report.file_name,
    fileSizeBytes: report.file_size_bytes,
    errorDetail: report.error_detail,
    downloadUrl,
    downloadExpiresInSeconds,
    createdAt: report.created_at.toISOString(),
  };
}
