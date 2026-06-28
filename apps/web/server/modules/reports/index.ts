// Reports module (P1-13) — takeoff exports rendered from the authoritative QuantityRollup and run
// as background jobs. The request path only enqueues + reads status (the heavy render is a worker
// job); exports never recompute quantities (P1-14 parity gate). MARKED_PLANS (a raster export) is
// not yet supported — the three data templates render to CSV.
export { reportsService, reportToView } from './service';
export type { RequestReportInput } from './service';
export { reportsRepo } from './repository';
export type { Report } from './repository';
export { generateReport } from './generate';
export type { ExportDeps, ExportJobInput, ExportResult } from './generate';
export { drainExportOne } from './consumer';
export { buildReportData } from './data';
export { renderReport, totalExtendedCostMinor } from './render';
export type { ReportConditionRow, ReportData } from './render';
export { checkParity, assertExportParity } from './parity';
export type { ParityMismatch } from './parity';
export {
  renderIntegrationExport,
  assertExportable,
  IntegrationExportError,
  FORMAT_VERSIONS,
} from './integration';
export type { RenderedIntegrationExport } from './integration';
