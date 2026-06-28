// Cloud-import module (P5-05) — import plan-set files from a customer's connected document store
// (Drive/Dropbox/OneDrive/S3) into the STANDARD ingestion pipeline. Imported files get the same
// validation + (in-ingestion) malware scan as direct uploads — an external source isn't trusted —
// and land at the same UPLOADED + enqueued-ingestion entry point, so the result is identical.
export { cloudImportService, type ImportDeps, type CloudImportResult } from './service';
export {
  stubCloudProvider,
  type CloudStorageProvider,
  type CloudFileRef,
  type FetchedFile,
} from './provider';
export { CloudImportError, type CloudImportErrorCode } from './errors';
