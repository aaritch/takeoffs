import { z } from 'zod';
import { CloudProvider } from '../enums/imports';
import { SourceFileView } from './uploads';

/**
 * Cloud-storage import (spec §10, P5-05) — pull plan-set files from a connected document store into
 * the standard ingestion pipeline. Each file is referenced by its id in the source; the result is
 * indistinguishable from a direct upload (same validation, same ingestion). A per-file failure is
 * reported (not thrown) so one bad file never leaves a half-imported set.
 */
export const CloudImportFileRef = z.object({
  /** The file's id in the source provider (e.g. a Drive file id). */
  externalId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  /** A short-lived access token for the connected source (opaque here). */
  accessToken: z.string().optional(),
});
export type CloudImportFileRef = z.infer<typeof CloudImportFileRef>;

/** POST /v1/plan-sets/{id}/imports — import files from a connected cloud source. */
export const ImportFromCloudRequest = z.object({
  provider: CloudProvider,
  files: z.array(CloudImportFileRef).min(1),
});
export type ImportFromCloudRequest = z.infer<typeof ImportFromCloudRequest>;

export const CloudImportFailure = z.object({
  externalId: z.string(),
  code: z.string(),
  message: z.string(),
});
export type CloudImportFailure = z.infer<typeof CloudImportFailure>;

export const ImportFromCloudResponse = z.object({
  imported: z.array(SourceFileView),
  failed: z.array(CloudImportFailure),
});
export type ImportFromCloudResponse = z.infer<typeof ImportFromCloudResponse>;
