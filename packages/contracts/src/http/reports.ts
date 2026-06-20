import { z } from 'zod';
import { ReportFormat, ReportStatus, ReportTemplate } from '../enums/billing';

/** POST /v1/takeoffs/{id}/reports — request a report export (enqueues a background job). */
export const CreateReportRequest = z.object({ template: ReportTemplate });
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

/**
 * A report export and its status. `downloadUrl` (a signed, expiring URL) and the size fields are
 * populated only once `status` is READY; the client polls until then.
 */
export const ReportView = z.object({
  id: z.string().uuid(),
  takeoffId: z.string().uuid(),
  template: ReportTemplate,
  format: ReportFormat,
  status: ReportStatus,
  fileName: z.string().nullable(),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  errorDetail: z.string().nullable(),
  downloadUrl: z.string().url().nullable(),
  downloadExpiresInSeconds: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});
export type ReportView = z.infer<typeof ReportView>;

export const CreateReportResponse = z.object({ report: ReportView });
export type CreateReportResponse = z.infer<typeof CreateReportResponse>;

export const ReportsListResponse = z.object({ reports: z.array(ReportView) });
export type ReportsListResponse = z.infer<typeof ReportsListResponse>;
