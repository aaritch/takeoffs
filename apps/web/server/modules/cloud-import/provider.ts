import type { CloudProvider } from '@takeoff/contracts';
import { CloudImportError } from './errors';

/**
 * Cloud-source provider seam (P5-05). Fetches a file's bytes from the customer's connected document
 * store (Google Drive / Dropbox / OneDrive / S3). The import service depends on this interface, not a
 * concrete SDK, so the real OAuth-backed adapters are a drop-in (like the other provider seams). A
 * permission or fetch problem throws a {@link CloudImportError} so the failure surfaces clearly.
 */
export interface CloudFileRef {
  provider: CloudProvider;
  externalId: string;
  filename: string;
  mimeType: string;
  accessToken?: string;
}

export interface FetchedFile {
  bytes: Buffer;
  filename: string;
  mimeType: string;
}

export interface CloudStorageProvider {
  fetch(ref: CloudFileRef): Promise<FetchedFile>;
}

/**
 * Stub provider used until the real OAuth adapters land. Models the failure modes the pipeline must
 * handle: `externalId='denied'` → permission error, `'missing'` → fetch error; otherwise returns
 * deterministic bytes. Real adapters stream the actual file from the source.
 */
export const stubCloudProvider: CloudStorageProvider = {
  async fetch(ref) {
    if (ref.externalId === 'denied') {
      throw new CloudImportError('PERMISSION_DENIED', `Access denied to "${ref.filename}".`);
    }
    if (ref.externalId === 'missing') {
      throw new CloudImportError('FETCH_FAILED', `Could not fetch "${ref.filename}".`);
    }
    return {
      bytes: Buffer.from(`STUB:${ref.externalId}`),
      filename: ref.filename,
      mimeType: ref.mimeType,
    };
  },
};
