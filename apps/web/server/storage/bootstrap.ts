import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3';
import { S3Storage } from './s3';
import { s3ConfigFromEnv } from './index';
import { orgStorageKey } from './keys';

/**
 * Setup-time helpers for the S3-compatible bucket (Cloudflare R2 in prod, MinIO locally).
 *
 * These are NOT part of the request path — they exist so the same `S3_*` env the app runs on
 * can be (a) verified end-to-end with one command and (b) have its browser-upload CORS applied
 * programmatically, instead of hand-editing the Cloudflare dashboard. Both run against whatever
 * `S3_*` points at, so the local MinIO round-trip and the hosted R2 setup use the identical
 * code path. See docs/runbooks/integrations-setup.md §4.
 */

/** A synthetic, well-formed org id used only to namespace the health-check object. */
const HEALTHCHECK_ORG = '00000000-0000-7000-8000-000000000000';

function s3ClientFromEnv(): { client: S3Client; bucket: string } {
  const config = s3ConfigFromEnv();
  const client = new S3Client({
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
  return { client, bucket: config.bucket };
}

export interface StorageCheck {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export interface VerifyStorageResult {
  bucket: string;
  endpoint: string;
  ok: boolean;
  checks: StorageCheck[];
}

async function timed(name: string, fn: () => Promise<void>): Promise<StorageCheck> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Exercise the real operations the app depends on against the configured bucket:
 * server-side PUT, signed download (browser read), signed upload (direct browser PUT),
 * and delete. Writes only under an `org/<synthetic>/_healthcheck/` prefix and cleans up.
 */
export async function verifyStorage(): Promise<VerifyStorageResult> {
  const config = s3ConfigFromEnv();
  const storage = new S3Storage(config);
  const endpoint = config.endpoint ?? 'AWS S3 (default endpoint)';
  const stamp = Date.now();
  const putKey = orgStorageKey(HEALTHCHECK_ORG, '_healthcheck', `put-${stamp}.txt`);
  const uploadKey = orgStorageKey(HEALTHCHECK_ORG, '_healthcheck', `upload-${stamp}.txt`);
  const checks: StorageCheck[] = [];

  checks.push(
    await timed('putObject (server-side write)', async () => {
      await storage.putObject(putKey, 'takeoff storage healthcheck', 'text/plain');
    }),
  );

  checks.push(
    await timed('signed download URL (browser read)', async () => {
      const { url } = await storage.getSignedDownloadUrl(putKey);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download returned HTTP ${res.status}`);
      const body = await res.text();
      if (body !== 'takeoff storage healthcheck') throw new Error('body mismatch on read-back');
    }),
  );

  checks.push(
    await timed('signed upload URL (direct browser PUT)', async () => {
      const { url } = await storage.getSignedUploadUrl(uploadKey, { contentType: 'text/plain' });
      const put = await fetch(url, {
        method: 'PUT',
        body: 'uploaded via signed url',
        headers: { 'content-type': 'text/plain' },
      });
      if (!put.ok) throw new Error(`signed PUT returned HTTP ${put.status}`);
    }),
  );

  checks.push(
    await timed('deleteObject (cleanup)', async () => {
      await storage.deleteObject(putKey);
      await storage.deleteObject(uploadKey);
    }),
  );

  return { bucket: config.bucket, endpoint, ok: checks.every((c) => c.ok), checks };
}

/**
 * The CORS policy required for direct browser uploads/downloads against the bucket:
 * GET + PUT + HEAD from the app origins, with ETag exposed so the client can confirm uploads.
 */
export function defaultCorsRules(allowedOrigins: string[]): CORSRule[] {
  return [
    {
      AllowedOrigins: allowedOrigins,
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ];
}

/** Apply the browser-upload CORS policy to the bucket, then read it back to confirm. */
export async function applyBucketCors(allowedOrigins: string[]): Promise<CORSRule[]> {
  if (allowedOrigins.length === 0) {
    throw new Error('At least one allowed origin is required to configure CORS');
  }
  const { client, bucket } = s3ClientFromEnv();
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: defaultCorsRules(allowedOrigins) },
    }),
  );
  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  return current.CORSRules ?? [];
}
