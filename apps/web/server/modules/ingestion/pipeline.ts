import { WORKING_DPI, type IngestStatus } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope } from '../../data/org-scope';
import { getLogger } from '../../platform/observability';
import type { StorageAdapter } from '../../storage';
import { orgStorageKey } from '../../storage/keys';
import { NotFound } from '../source-files/errors';
import { sourceFilesRepo, type SourceFile } from '../source-files/repository';
import { CorruptFileError, defaultPageInventory, type PageInventory } from './page-inventory';
import { recomputePlanSetStatus, sheetsRepo, type Sheet } from './repository';
import type { Rasterizer } from './rasterizer';
import type { Tiler } from './tiler';
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
  /** Provide BOTH to enable the rasterize+tile step (P1-03); omit for split-only ingestion. */
  rasterizer?: Rasterizer;
  tiler?: Tiler;
  /** Working render DPI (default 150). */
  dpi?: number;
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

  // SPLITTING: one Sheet per page, in order (idempotent — replace this file's sheets).
  const createdSheets = await withOrgScope(db, orgId, async (tx) => {
    await sheetsRepo.deleteBySourceFile(tx, sourceFileId);
    const rows = await sheetsRepo.insertMany(
      tx,
      Array.from({ length: pageCount }, (_, i) => ({
        org_id: orgId,
        plan_set_id: sf.plan_set_id,
        source_file_id: sourceFileId,
        index_in_set: i,
      })),
    );
    await sourceFilesRepo.update(tx, sourceFileId, { page_count: pageCount, error_detail: null });
    return rows;
  });

  // RASTERIZE + TILE (P1-03) when both are configured; otherwise stop at split.
  if (deps.rasterizer && deps.tiler) {
    await rasterizeAndTile(deps, deps.rasterizer, deps.tiler, orgId, sf, createdSheets, bytes);
  }

  await withOrgScope(db, orgId, async (tx) => {
    await sourceFilesRepo.update(tx, sourceFileId, { ingest_status: 'PROCESSED' });
    await recomputePlanSetStatus(tx, sf.plan_set_id);
  });

  getLogger().info('ingest complete', {
    event: 'ingest_complete',
    sourceFileId,
    sheetCount: pageCount,
  });
  return { status: 'PROCESSED', sheetCount: pageCount };
}

/** Render each sheet's page to a tile pyramid + thumbnail and record its dimensions/keys. */
async function rasterizeAndTile(
  deps: IngestionDeps,
  rasterizer: NonNullable<IngestionDeps['rasterizer']>,
  tiler: NonNullable<IngestionDeps['tiler']>,
  orgId: string,
  sf: SourceFile,
  sheetList: Sheet[],
  bytes: Uint8Array,
): Promise<void> {
  const dpi = deps.dpi ?? WORKING_DPI;
  await setStatus(deps.db, orgId, sf.id, 'RASTERIZING');
  const doc = await rasterizer.open(sf.mime_type, bytes, dpi);
  try {
    const ordered = [...sheetList].sort((a, b) => a.index_in_set - b.index_in_set);
    for (const sheet of ordered) {
      const page = await doc.renderPage(sheet.index_in_set);
      const sheetPrefix = orgStorageKey(orgId, 'plan-sets', sf.plan_set_id, 'sheets', sheet.id);
      const tiled = await tiler.tile(deps.storage, {
        png: page.png,
        width: page.width,
        height: page.height,
        sheetPrefix,
      });
      await withOrgScope(deps.db, orgId, (tx) =>
        sheetsRepo.update(tx, sheet.id, {
          width_px: tiled.width,
          height_px: tiled.height,
          dpi,
          tile_pyramid_key: tiled.tilePyramidKey,
          thumbnail_key: tiled.thumbnailKey,
        }),
      );
    }
    await setStatus(deps.db, orgId, sf.id, 'TILING');
  } finally {
    await doc.close();
  }
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
