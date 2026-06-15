import { S3Storage, type S3Config } from './s3';
import type { StorageAdapter } from './adapter';

export * from './adapter';
export * from './keys';
export { S3Storage } from './s3';
export type { S3Config } from './s3';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** Build the S3 config from the environment (local MinIO or hosted S3/R2). */
export function s3ConfigFromEnv(): S3Config {
  return {
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  };
}

let cached: StorageAdapter | undefined;

/** The process-wide storage adapter, created lazily from the environment. */
export function getStorage(): StorageAdapter {
  if (!cached) {
    cached = new S3Storage(s3ConfigFromEnv());
  }
  return cached;
}
