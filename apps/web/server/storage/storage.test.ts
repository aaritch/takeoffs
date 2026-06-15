import { afterAll, describe, expect, it } from 'vitest';
import { S3Storage } from './s3';
import { orgStorageKey } from './keys';

// Runs against the local MinIO from the docker stack (pnpm dev:up). Verifies the real
// put / signed-download / signed-upload round-trips that P1-01 will rely on.
const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'takeoff-dev',
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'takeoff',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'takeoffdev',
  forcePathStyle: true,
});

const ORG = '018f3a2b-0000-7000-8000-000000000abc';
const created: string[] = [];
const key = (name: string): string => {
  const k = orgStorageKey(ORG, 'test', name);
  created.push(k);
  return k;
};

afterAll(async () => {
  for (const k of created) {
    try {
      await storage.deleteObject(k);
    } catch {
      // best-effort cleanup
    }
  }
});

describe('S3Storage (local MinIO)', () => {
  it('puts an object and reads it back through a signed download URL', async () => {
    const k = key('hello.txt');
    await storage.putObject(k, 'hello world', 'text/plain');
    const { url } = await storage.getSignedDownloadUrl(k);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world');
  });

  it('accepts a direct upload via a signed upload URL', async () => {
    const k = key('upload.txt');
    const { url } = await storage.getSignedUploadUrl(k, { contentType: 'text/plain' });
    const put = await fetch(url, {
      method: 'PUT',
      body: 'uploaded directly',
      headers: { 'content-type': 'text/plain' },
    });
    expect(put.ok).toBe(true);

    const { url: downloadUrl } = await storage.getSignedDownloadUrl(k);
    expect(await (await fetch(downloadUrl)).text()).toBe('uploaded directly');
  });
});
