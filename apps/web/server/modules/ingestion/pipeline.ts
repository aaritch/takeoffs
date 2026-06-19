import type { IngestStatus } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { getLogger } from '../../platform/observability';
import type { StorageAdapter } from '../../storage';
import { NotFound } from '../source-files/errors';
import { sourceFilesRepo, type SourceFile } from '../source-files/repository';
import { CorruptFileError, defaultPageInventory, type PageInventory } from './page-inventory';
import { recomputePlanSetStatus, sheetsRepo } from './repository';
import { eicarScanner, type Scanner } from './scanner';
import { loggingNotifier, type Notifier } from './notifier';

/**
 * Ingestion pipeline (P1-02): confirm → scan → inventory → split. Driven by an IngestionJob; each
 * step writes the SourceFile's `ingest_status` so the UI can show real progress. Runs under the
 * job's org scope (RLS) even though it's a worker, never a user. Idempotent (re-running a
 * PROCESSED file is a no-op; a re-split replaces that file's sheets) and partial-failure-safe (a
 * bad file FAILs alone and flips the plan set to PARTIAL — it never takes the whole set down).
 *
 * NOTE: until rasterize/tile (P1-03) and extract (P1-04) land, "split done" is treated as the
 * terminal PROCESSED state; those steps will be inserted before PROCESSED when they're built.
 */

export interface IngestionDeps {
  /** The RLS-subject app database (APP_DATABASE_URL). */
  db: DB;
  storage: StorageAdapter;
  scanner?: Scanner;
  pageInventory?: PageInventory;
  notifier?: Notifier;
}

export interface IngestResult {
  status: 'PROCESSED' | 'FAILED' | 'SKIPPED';
  sheetCount: number;
  reason?: string;
}

export async function ingestSourceFile(
  deps: IngestionDeps,
  input: { orgId: string; sourceFileId: string },
): Promise<IngestResult> {
  const scanner = deps.scanner ?? eicarScanner;
  const inventory = deps.pageInventory ?? defaultPageInventory;
  const notifier = deps.notifier ?? loggingNotifier;
  const { db, storage } = deps;
  const { orgId, sourceFileId } = input;

  const sf = await withOrgScope(db, orgId, (tx) => sourceFilesRepo.getById(tx, sourceFileId));
  if (!sf) throw NotFound();

  // Idempotent: an already-PROCESSED file is a no-op.
  if (sf.ingest_status === 'PROCESSED') {
    const sheetCount = await withOrgScope(db, orgId, (tx) =>
      sheetsRepo.countBySourceFile(tx, sourceFileId),
    );
    return { status: 'SKIPPED', sheetCount };
  }

  await setStatus(db, orgId, sourceFileId, 'SCANNING');
  const bytes = await storage.getObject(sf.storage_key);

  const scan = await scanner.scan(bytes);
  if (!scan.clean) {
    return fail(db, orgId, notifier, sf, `Malware detected: ${scan.signature}`);
  }

  await setStatus(db, orgId, sourceFileId, 'SPLITTING');
  let pageCount: number;
  try {
    pageCount = await inventory.count(sf.mime_type, bytes);
  } catch (err) {
    if (err instanceof CorruptFileError) return fail(db, orgId, notifier, sf, err.message);
    throw err;
  }

  const sheetCount = await withOrgScope(db, orgId, async (tx) => {
    await sheetsRepo.deleteBySourceFile(tx, sourceFileId); // idempotent re-split
    await sheetsRepo.insertMany(
      tx,
      Array.from({ length: pageCount }, (_, i) => ({
        org_id: orgId,
        plan_set_id: sf.plan_set_id,
        source_file_id: sourceFileId,
        index_in_set: i,
      })),
    );
    await sourceFilesRepo.update(tx, sourceFileId, {
      ingest_status: 'PROCESSED',
      page_count: pageCount,
      error_detail: null,
    });
    await recomputePlanSetStatus(tx, sf.plan_set_id);
    return pageCount;
  });

  getLogger().info('ingest complete', { event: 'ingest_complete', sourceFileId, sheetCount });
  return { status: 'PROCESSED', sheetCount };
}

async function setStatus(db: DB, orgId: string, id: string, status: IngestStatus): Promise<void> {
  await withOrgScope(db, orgId, (tx) => sourceFilesRepo.update(tx, id, { ingest_status: status }));
}

/** Mark this file FAILED (with the reason), flip the plan set to PARTIAL, and notify the uploader. */
async function fail(
  db: DB,
  orgId: string,
  notifier: Notifier,
  sf: SourceFile,
  reason: string,
): Promise<IngestResult> {
  await withOrgScope(db, orgId, async (tx) => {
    await sourceFilesRepo.update(tx, sf.id, { ingest_status: 'FAILED', error_detail: reason });
    await recomputePlanSetStatus(tx, sf.plan_set_id);
  });
  await notifier.ingestFailed({
    orgId,
    planSetId: sf.plan_set_id,
    sourceFileId: sf.id,
    filename: sf.original_filename,
    reason,
  });
  return { status: 'FAILED', sheetCount: 0, reason };
}
