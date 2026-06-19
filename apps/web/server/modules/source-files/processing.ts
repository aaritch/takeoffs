import { INGESTION_QUEUE, type ProcessingStatusView } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope, type OrgScopedTx } from '../../data/org-scope';
import { enqueue } from '../../platform/queue';
import { sheetsRepo } from '../ingestion/repository';
import { NotFound, ValidationFailed } from './errors';
import { planSetsRepo, sourceFilesRepo } from './repository';

/**
 * Processing status + retry (P1-05). Surfaces granular per-file and per-sheet progress so the
 * client can show what's ready vs pending (never one opaque spinner), and re-enqueues a failed
 * file's ingestion.
 */

/** Assemble the per-file / per-sheet processing view for a plan set. */
export async function getPlanSetStatus(
  tx: OrgScopedTx,
  planSetId: string,
): Promise<ProcessingStatusView> {
  const planSet = await planSetsRepo.getById(tx, planSetId);
  if (!planSet) throw NotFound('Plan set not found');

  const files = await sourceFilesRepo.listByPlanSet(tx, planSetId);
  const sourceFiles = await Promise.all(
    files.map(async (f) => {
      const sheets = await sheetsRepo.listBySourceFile(tx, f.id);
      return {
        id: f.id,
        originalFilename: f.original_filename,
        ingestStatus: f.ingest_status,
        errorDetail: f.error_detail,
        pageCount: f.page_count,
        sheets: sheets.map((s) => ({
          id: s.id,
          indexInSet: s.index_in_set,
          sheetNumber: s.sheet_number,
          thumbnailKey: s.thumbnail_key,
          ready: s.tile_pyramid_key !== null, // tiles exist → viewable
        })),
      };
    }),
  );

  return {
    planSet: {
      id: planSet.id,
      processingStatus: planSet.processing_status,
      sourceFileCount: planSet.source_file_count,
      totalSheetCount: planSet.total_sheet_count,
    },
    sourceFiles,
  };
}

/**
 * Retry a FAILED file: reset it to PENDING, clear the error, and re-enqueue ingestion. Only
 * FAILED files are retryable (a PROCESSED file is already done; an in-flight one shouldn't be
 * double-queued). Idempotent re-processing makes at-least-once delivery safe.
 */
export async function retrySourceFile(
  db: DB,
  input: { orgId: string; sourceFileId: string },
): Promise<void> {
  const { orgId, sourceFileId } = input;
  const sf = await withOrgScope(db, orgId, async (tx) => {
    const current = await sourceFilesRepo.getById(tx, sourceFileId);
    if (!current) throw NotFound();
    if (current.ingest_status !== 'FAILED') {
      throw ValidationFailed(
        `Only a FAILED file can be retried (this one is ${current.ingest_status}).`,
      );
    }
    return sourceFilesRepo.update(tx, sourceFileId, {
      ingest_status: 'PENDING',
      error_detail: null,
    });
  });

  await enqueue(INGESTION_QUEUE, {
    sourceFileId,
    planSetId: sf!.plan_set_id,
    orgId,
    storageKey: sf!.storage_key,
    checksumSha256: sf!.checksum_sha256,
  });
}
