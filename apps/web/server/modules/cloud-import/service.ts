import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { INGESTION_QUEUE, UPLOAD_LIMITS, type SourceFileView } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { enqueue as defaultEnqueue } from '../../platform/queue';
import type { StorageAdapter } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import {
  extensionOf,
  isAllowedType,
  planSetsRepo,
  sourceFileToView,
  sourceFilesRepo,
} from '../source-files';
import { NotFound } from '../source-files/errors';
import { CloudImportError } from './errors';
import type { CloudFileRef, CloudStorageProvider } from './provider';

export interface ImportDeps {
  provider: CloudStorageProvider;
  /** Defaults to the real queue producer; injectable for tests. */
  enqueue?: (queue: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface CloudImportResult {
  imported: SourceFileView[];
  failed: { externalId: string; code: string; message: string }[];
}

/**
 * Import one cloud file into a plan set, landing it at the SAME pipeline entry point as a direct
 * upload: fetch → validate (type + size, exactly as uploads) → store → an UPLOADED SourceFile + an
 * enqueued ingestion job. The malware scan + processing run inside ingestion (the standard pipeline),
 * so the processed result is identical to an upload — and an external source gets no special trust.
 *
 * External calls (fetch, putObject) happen OUTSIDE the DB transaction; the row + enqueue commit
 * together at the end. A failure before that point throws, leaving no row, no job (no half-import).
 */
async function importOne(
  db: DB,
  storage: StorageAdapter,
  orgId: string,
  planSetId: string,
  fileRef: CloudFileRef,
  deps: ImportDeps,
): Promise<SourceFileView> {
  // 1. Fetch from the (untrusted) external source — throws on permission/fetch failure.
  const fetched = await deps.provider.fetch(fileRef);

  // 2. SAME validation as an upload: allowed type + within the per-file size limit.
  if (!isAllowedType(fetched.filename, fetched.mimeType)) {
    throw new CloudImportError('UNSUPPORTED_TYPE', `Unsupported file type: "${fetched.filename}".`);
  }
  if (fetched.bytes.length > UPLOAD_LIMITS.maxFileBytes) {
    throw new CloudImportError(
      'TOO_LARGE',
      `"${fetched.filename}" exceeds the per-file size limit.`,
    );
  }

  // 3. Checksum the fetched bytes + derive a safe, org-namespaced storage key.
  const checksum = createHash('sha256').update(fetched.bytes).digest('hex');
  const sourceFileId = uuidv7();
  const storageKey = orgStorageKey(
    orgId,
    'plan-sets',
    planSetId,
    `${sourceFileId}${extensionOf(fetched.filename)}`,
  );

  // 4. Write to OUR object storage (server-side — the customer never PUTs).
  await storage.putObject(storageKey, fetched.bytes, fetched.mimeType);

  // 5. Converge with the upload path: UPLOADED row + ingestion enqueued, atomically.
  const enqueue = deps.enqueue ?? defaultEnqueue;
  return withOrgScope(db, orgId, async (tx) => {
    const sf = await sourceFilesRepo.insert(tx, {
      id: sourceFileId,
      org_id: orgId,
      plan_set_id: planSetId,
      original_filename: fetched.filename,
      mime_type: fetched.mimeType,
      byte_size: fetched.bytes.length,
      checksum_sha256: checksum,
      storage_key: storageKey,
      upload_status: 'UPLOADED',
    });
    await planSetsRepo.addToSourceFileCount(tx, planSetId, 1);
    await enqueue(INGESTION_QUEUE, {
      sourceFileId: sf.id,
      planSetId,
      orgId,
      storageKey,
      checksumSha256: checksum,
    });
    return sourceFileToView(sf);
  });
}

export const cloudImportService = {
  /** Import a single cloud file. Throws on plan-set / fetch / validation failure. */
  async importFile(
    db: DB,
    storage: StorageAdapter,
    orgId: string,
    input: { planSetId: string; fileRef: CloudFileRef },
    deps: ImportDeps,
  ): Promise<SourceFileView> {
    const planSet = await withOrgScope(db, orgId, (tx) =>
      planSetsRepo.getById(tx, input.planSetId),
    );
    if (!planSet) throw NotFound('Plan set not found');
    return importOne(db, storage, orgId, input.planSetId, input.fileRef, deps);
  },

  /**
   * Import a batch. The plan set is checked once; each file is then imported independently and a
   * per-file failure is COLLECTED (not thrown), so one inaccessible/oversized file never aborts the
   * others or leaves a half-imported set.
   */
  async importFiles(
    db: DB,
    storage: StorageAdapter,
    orgId: string,
    input: { planSetId: string; files: CloudFileRef[] },
    deps: ImportDeps,
  ): Promise<CloudImportResult> {
    const planSet = await withOrgScope(db, orgId, (tx) =>
      planSetsRepo.getById(tx, input.planSetId),
    );
    if (!planSet) throw NotFound('Plan set not found');

    const imported: SourceFileView[] = [];
    const failed: CloudImportResult['failed'] = [];
    for (const fileRef of input.files) {
      try {
        imported.push(await importOne(db, storage, orgId, input.planSetId, fileRef, deps));
      } catch (err) {
        const code = err instanceof CloudImportError ? err.code : 'IMPORT_FAILED';
        failed.push({
          externalId: fileRef.externalId,
          code,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
    return { imported, failed };
  },
};
