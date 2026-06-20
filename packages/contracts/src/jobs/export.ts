import { z } from 'zod';
import { Traceable } from '../observability';
import { ReportTemplate } from '../enums/billing';

/**
 * Report export job (P1-13). The API enqueues this when a report is requested; the worker-exports
 * process drains it, renders the template from the authoritative rollups, stores the artifact, and
 * flips the Report row to READY. Idempotent + retriable: re-running a reportId regenerates the same
 * artifact under the same storage key.
 */
export const EXPORT_QUEUE = 'jobs:export';

export const ExportJob = Traceable.extend({
  reportId: z.string().uuid(),
  takeoffId: z.string().uuid(),
  orgId: z.string().uuid(),
  template: ReportTemplate,
});
export type ExportJob = z.infer<typeof ExportJob>;
