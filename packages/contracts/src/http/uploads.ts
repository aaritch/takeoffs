import { z } from 'zod';
import { IngestStatus, SourceFileUploadStatus } from '../enums/projects';

/**
 * Direct-to-storage upload contract (P1-01, spec §10.2). The client asks the API for short-lived
 * signed URLs, PUTs each file straight to object storage (never through the app servers), then
 * tells the API it's done; the API verifies size + checksum and enqueues ingestion.
 *
 * Type and size are validated BEFORE a URL is issued and AGAIN on completion — the client's
 * declared content-type is never trusted on its own (spec §10.2 caveat).
 */

/** Accepted upload types: construction drawings (PDF) and raster images, with their extensions. */
export const ALLOWED_UPLOAD_TYPES = [
  { mimeType: 'application/pdf', extensions: ['.pdf'] },
  { mimeType: 'image/png', extensions: ['.png'] },
  { mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mimeType: 'image/tiff', extensions: ['.tif', '.tiff'] },
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = ALLOWED_UPLOAD_TYPES.map((t) => t.mimeType);

/**
 * Launch upload ceilings (provisional — tune with real plan-set data; spec §10.2 caveat: very
 * large CAD sets can overwhelm processing). Bytes are integer minor units of storage, not money.
 */
export const UPLOAD_LIMITS = {
  /** Largest single file accepted (500 MiB). */
  maxFileBytes: 500 * 1024 * 1024,
  /** Most files in one plan set / upload request. */
  maxFilesPerSet: 200,
  /** Largest aggregate size of one plan set (2 GiB). */
  maxSetBytes: 2 * 1024 * 1024 * 1024,
} as const;

/** A lowercase hex SHA-256 digest. */
export const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'must be a lowercase hex SHA-256');

/** One file the client wants to upload, described before any bytes move. */
export const RequestedFile = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksumSha256: Sha256Hex,
});
export type RequestedFile = z.infer<typeof RequestedFile>;

/** POST /v1/plan-sets/{id}/upload-urls — request signed URLs for a batch of files. */
export const CreateUploadUrlsRequest = z.object({
  files: z.array(RequestedFile).min(1).max(UPLOAD_LIMITS.maxFilesPerSet),
});
export type CreateUploadUrlsRequest = z.infer<typeof CreateUploadUrlsRequest>;

/** A signed destination for one file: the client PUTs the bytes here with the given headers. */
export const UploadTarget = z.object({
  sourceFileId: z.string().uuid(),
  originalFilename: z.string(),
  storageKey: z.string(),
  uploadUrl: z.string().url(),
  method: z.literal('PUT'),
  /** Headers the client MUST send with the PUT (e.g. content-type, checksum) for the signature. */
  headers: z.record(z.string()),
  expiresInSeconds: z.number().int().positive(),
});
export type UploadTarget = z.infer<typeof UploadTarget>;

export const CreateUploadUrlsResponse = z.object({
  planSetId: z.string().uuid(),
  uploads: z.array(UploadTarget),
});
export type CreateUploadUrlsResponse = z.infer<typeof CreateUploadUrlsResponse>;

/** POST /v1/source-files/{id}/complete — client reports the upload finished; API re-verifies. */
export const CompleteUploadRequest = z.object({
  checksumSha256: Sha256Hex,
  byteSize: z.number().int().positive(),
});
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequest>;

/** The API's view of a SourceFile. */
export const SourceFileView = z.object({
  id: z.string().uuid(),
  planSetId: z.string().uuid(),
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksumSha256: Sha256Hex,
  uploadStatus: SourceFileUploadStatus,
  ingestStatus: IngestStatus,
  pageCount: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});
export type SourceFileView = z.infer<typeof SourceFileView>;

export const CompleteUploadResponse = z.object({ sourceFile: SourceFileView });
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponse>;
