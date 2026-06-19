/** A time-limited signed URL for a single object. */
export interface SignedUrl {
  url: string;
  expiresInSeconds: number;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  contentType?: string;
  /**
   * Hex SHA-256 the upload MUST match. When set, the presigned PUT requires the
   * `x-amz-checksum-sha256` header, so storage itself rejects corrupted bytes — and the digest is
   * readable back via `headObject` for verify-on-complete (P1-01).
   */
  checksumSha256Hex?: string;
}

/** Metadata about a stored object (from a HEAD), used to verify a completed upload. */
export interface HeadObjectResult {
  contentLength: number;
  /** Hex SHA-256 the store computed, if the object was uploaded with one. */
  checksumSha256?: string;
}

/**
 * Object-storage operations the app depends on. Implemented by S3Storage (S3-compatible:
 * MinIO locally, Cloudflare R2 / AWS S3 in prod). Keys MUST be built via the org-namespacing
 * helpers in `keys.ts` so storage isolation mirrors database isolation (P0-07).
 */
export interface StorageAdapter {
  putObject(key: string, body: Uint8Array | string, contentType?: string): Promise<void>;
  /** Signed URL the client PUTs a file to directly (spec §10.2 direct-to-storage uploads). */
  getSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrl>;
  /** Signed, expiring URL to read a single object (reports/tiles delivery). */
  getSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrl>;
  /** Read an object's size (and checksum, if any) — used to verify a completed upload. */
  headObject(key: string): Promise<HeadObjectResult>;
  /** Download an object's full bytes (server-side workers: ingestion scan/inventory). */
  getObject(key: string): Promise<Uint8Array>;
  /** List object keys under a prefix (e.g. to enumerate a sheet's tile pyramid). */
  listObjects(prefix: string): Promise<string[]>;
  deleteObject(key: string): Promise<void>;
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900; // 15 minutes
