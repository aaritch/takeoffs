import { uuidv7 } from 'uuidv7';
import {
  CreateUploadUrlsResponse,
  INGESTION_QUEUE,
  type CompleteUploadRequest,
  type PlanSetView,
  type RequestedFile,
  type SourceFileView,
  type UploadTarget,
} from '@takeoff/contracts';
import { currentOrgId, type OrgScopedTx } from '../../data/org-scope';
import { enqueue } from '../../platform/queue';
import { orgStorageKey } from '../../storage/keys';
import type { StorageAdapter } from '../../storage';
import { projectsRepo } from '../projects/repository';
import { NotFound, ValidationFailed } from './errors';
import { planSetsRepo, sourceFilesRepo, type PlanSet, type SourceFile } from './repository';
import { extensionOf, validateUploadRequest, verifyCompletion } from './validation';

export function planSetToView(ps: PlanSet): PlanSetView {
  return {
    id: ps.id,
    projectId: ps.project_id,
    versionNumber: ps.version_number,
    label: ps.label,
    sourceFileCount: ps.source_file_count,
    totalSheetCount: ps.total_sheet_count,
    processingStatus: ps.processing_status,
    createdAt: ps.created_at.toISOString(),
  };
}

function toView(sf: SourceFile): SourceFileView {
  return {
    id: sf.id,
    planSetId: sf.plan_set_id,
    originalFilename: sf.original_filename,
    mimeType: sf.mime_type,
    byteSize: sf.byte_size,
    checksumSha256: sf.checksum_sha256,
    uploadStatus: sf.upload_status,
    ingestStatus: sf.ingest_status,
    pageCount: sf.page_count,
    createdAt: sf.created_at.toISOString(),
  };
}

/** Base64 of a hex digest — the value the client must send as `x-amz-checksum-sha256`. */
const checksumHeader = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

export const sourceFilesService = {
  /** Create a new plan-set version under a project the caller's org owns. */
  async createPlanSet(
    tx: OrgScopedTx,
    input: { projectId: string; label?: string; uploadedByUserId?: string },
  ) {
    const orgId = await currentOrgId(tx);
    // RLS-scoped read: only succeeds if the project belongs to this org (prevents attaching a
    // plan set to another tenant's project via the FK).
    const project = await projectsRepo.getById(tx, input.projectId);
    if (!project) throw NotFound('Project not found');

    return planSetsRepo.insert(tx, {
      org_id: orgId,
      project_id: input.projectId,
      version_number: await planSetsRepo.nextVersionNumber(tx, input.projectId),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.uploadedByUserId !== undefined
        ? { uploaded_by_user_id: input.uploadedByUserId }
        : {}),
    });
  },

  /**
   * Validate a batch, create SourceFile rows (AWAITING_UPLOAD), and return short-lived signed PUT
   * URLs. Type + size are checked here, before any URL is issued; the same digest binds the PUT so
   * storage rejects corrupted bytes.
   */
  async createUploadUrls(
    tx: OrgScopedTx,
    storage: StorageAdapter,
    input: { planSetId: string; files: RequestedFile[] },
  ): Promise<CreateUploadUrlsResponse> {
    const validation = validateUploadRequest(input.files);
    if (!validation.ok) {
      throw ValidationFailed('Upload request is invalid', { details: validation.errors });
    }

    const orgId = await currentOrgId(tx);
    const planSet = await planSetsRepo.getById(tx, input.planSetId);
    if (!planSet) throw NotFound('Plan set not found');

    const uploads: UploadTarget[] = [];
    for (const file of input.files) {
      const sourceFileId = uuidv7();
      // Object name is the id + extension (not the human filename) so keys are always safe; the
      // original filename is preserved in the row.
      const storageKey = orgStorageKey(
        orgId,
        'plan-sets',
        input.planSetId,
        `${sourceFileId}${extensionOf(file.filename)}`,
      );

      await sourceFilesRepo.insert(tx, {
        id: sourceFileId,
        org_id: orgId,
        plan_set_id: input.planSetId,
        original_filename: file.filename,
        mime_type: file.mimeType,
        byte_size: file.byteSize,
        checksum_sha256: file.checksumSha256,
        storage_key: storageKey,
      });

      const signed = await storage.getSignedUploadUrl(storageKey, {
        contentType: file.mimeType,
        checksumSha256Hex: file.checksumSha256,
      });
      uploads.push({
        sourceFileId,
        originalFilename: file.filename,
        storageKey,
        uploadUrl: signed.url,
        method: 'PUT',
        headers: {
          'content-type': file.mimeType,
          'x-amz-checksum-sha256': checksumHeader(file.checksumSha256),
        },
        expiresInSeconds: signed.expiresInSeconds,
      });
    }

    await planSetsRepo.addToSourceFileCount(tx, input.planSetId, input.files.length);
    return { planSetId: input.planSetId, uploads };
  },

  /**
   * Verify a completed upload against the stored object's real size/checksum and, on success,
   * mark it UPLOADED and enqueue ingestion. A mismatch (or an unsupported declaration) rejects the
   * file. Idempotent: completing an already-UPLOADED file just returns it.
   */
  async completeUpload(
    tx: OrgScopedTx,
    storage: StorageAdapter,
    input: { sourceFileId: string } & CompleteUploadRequest,
  ): Promise<SourceFileView> {
    const orgId = await currentOrgId(tx);
    const sf = await sourceFilesRepo.getById(tx, input.sourceFileId);
    if (!sf) throw NotFound();
    if (sf.upload_status === 'UPLOADED') return toView(sf);

    // The completion must report the same size/checksum declared at init (no moving the goalposts).
    if (input.byteSize !== sf.byte_size || input.checksumSha256 !== sf.checksum_sha256) {
      throw ValidationFailed('Completion does not match the declared upload');
    }

    const actual = await storage.headObject(sf.storage_key);
    const result = verifyCompletion(
      { byteSize: sf.byte_size, checksumSha256: sf.checksum_sha256 },
      {
        byteSize: actual.contentLength,
        ...(actual.checksumSha256 ? { checksumSha256: actual.checksumSha256 } : {}),
      },
    );
    if (!result.ok) {
      // Rejection is a real, persisted outcome (not an exception that would roll back the write).
      // The route surfaces it as a 4xx; ingestion is NOT enqueued.
      const rejected = await sourceFilesRepo.update(tx, sf.id, {
        upload_status: 'REJECTED',
        error_detail: result.reason,
      });
      return toView(rejected ?? sf);
    }

    const updated = await sourceFilesRepo.update(tx, sf.id, { upload_status: 'UPLOADED' });
    await enqueue(INGESTION_QUEUE, {
      sourceFileId: sf.id,
      planSetId: sf.plan_set_id,
      orgId,
      storageKey: sf.storage_key,
      checksumSha256: sf.checksum_sha256,
    });
    return toView(updated ?? sf);
  },
};
