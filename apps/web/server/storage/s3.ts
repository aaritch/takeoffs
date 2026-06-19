import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  type HeadObjectResult,
  type SignedUrl,
  type SignedUrlOptions,
  type StorageAdapter,
} from './adapter';

const hexToBase64 = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');
const base64ToHex = (b64: string): string => Buffer.from(b64, 'base64').toString('hex');

export interface S3Config {
  /** Custom endpoint for S3-compatible services (MinIO, R2). Omit for AWS S3. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style addressing — required by MinIO; defaults on when an endpoint is set. */
  forcePathStyle?: boolean;
}

/** S3-compatible storage (MinIO locally; Cloudflare R2 / AWS S3 in production). */
export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    });
  }

  async putObject(key: string, body: Uint8Array | string, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async getSignedUploadUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrl> {
    const expiresIn = options?.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options?.contentType ? { ContentType: options.contentType } : {}),
        // Bind the upload to the expected digest: storage rejects the PUT if the bytes don't
        // match, and the digest is readable back for verify-on-complete.
        ...(options?.checksumSha256Hex
          ? { ChecksumSHA256: hexToBase64(options.checksumSha256Hex) }
          : {}),
      }),
      { expiresIn },
    );
    return { url, expiresInSeconds: expiresIn };
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: 'ENABLED' }),
    );
    return {
      contentLength: res.ContentLength ?? 0,
      ...(res.ChecksumSHA256 ? { checksumSha256: base64ToHex(res.ChecksumSHA256) } : {}),
    };
  }

  async getSignedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<SignedUrl> {
    const expiresIn = options?.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
    return { url, expiresInSeconds: expiresIn };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
