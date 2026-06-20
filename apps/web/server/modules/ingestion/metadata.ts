import type { Discipline, SheetView, UpdateSheetMetadataRequest } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { withOrgScope, type OrgScopedTx } from '../../data/org-scope';
import { sheets } from '../../data/schema';
import type { StorageAdapter } from '../../storage';
import { NotFound } from '../source-files/errors';
import { sourceFilesRepo } from '../source-files/repository';
import type { MetadataExtractor } from './extractor';
import { sheetsRepo, type Sheet } from './repository';

/** Normalized, lowercased search index entry from a sheet's metadata (null when empty). */
function buildSearchText(
  number: string | null,
  title: string | null,
  discipline: Discipline,
): string | null {
  const parts = [number, title, discipline === 'UNKNOWN' ? null : discipline].filter(Boolean);
  return parts.length ? parts.join(' ').toLowerCase() : null;
}

export function sheetToView(s: Sheet): SheetView {
  return {
    id: s.id,
    planSetId: s.plan_set_id,
    sourceFileId: s.source_file_id,
    indexInSet: s.index_in_set,
    sheetNumber: s.sheet_number,
    sheetTitle: s.sheet_title,
    discipline: s.discipline,
    widthPx: s.width_px,
    heightPx: s.height_px,
    dpi: s.dpi,
    tilePyramidKey: s.tile_pyramid_key,
    thumbnailKey: s.thumbnail_key,
    scaleStatus: s.scale_status,
    unitPerPixel: s.unit_per_pixel,
    scaleUnits: s.scale_units,
    createdAt: s.created_at.toISOString(),
  };
}

export interface MetadataDeps {
  db: DB;
  storage: StorageAdapter;
  extractor: MetadataExtractor;
}

/**
 * Extract candidate metadata for every sheet of a source file and apply it — but ONLY to fields
 * the user hasn't edited (USER provenance wins, so re-extraction never clobbers a human edit).
 * Best-effort: missing values just leave the field blank. `bytes` is fetched from storage when not
 * supplied (so this is callable standalone, e.g. a re-extract, as well as inline in the pipeline).
 */
export async function extractAndApply(
  deps: MetadataDeps,
  input: { orgId: string; sourceFileId: string; bytes?: Uint8Array },
): Promise<void> {
  const { orgId, sourceFileId } = input;
  const sf = await withOrgScope(deps.db, orgId, (tx) => sourceFilesRepo.getById(tx, sourceFileId));
  if (!sf) throw NotFound();
  const bytes = input.bytes ?? (await deps.storage.getObject(sf.storage_key));
  const list = await withOrgScope(deps.db, orgId, (tx) =>
    sheetsRepo.listBySourceFile(tx, sourceFileId),
  );

  const doc = await deps.extractor.open(sf.mime_type, bytes);
  try {
    for (const sheet of list) {
      const meta = await doc.extractPage(sheet.index_in_set);
      await withOrgScope(deps.db, orgId, async (tx) => {
        const current = await sheetsRepo.getById(tx, sheet.id);
        if (!current) return;
        const patch: Partial<typeof sheets.$inferInsert> = {};
        let number = current.sheet_number;
        let title = current.sheet_title;
        let discipline = current.discipline;

        if (current.sheet_number_source !== 'USER' && meta.sheetNumber) {
          patch.sheet_number = meta.sheetNumber;
          patch.sheet_number_source = 'EXTRACTED';
          number = meta.sheetNumber;
        }
        if (current.sheet_title_source !== 'USER' && meta.sheetTitle) {
          patch.sheet_title = meta.sheetTitle;
          patch.sheet_title_source = 'EXTRACTED';
          title = meta.sheetTitle;
        }
        if (current.discipline_source !== 'USER' && meta.discipline) {
          patch.discipline = meta.discipline;
          patch.discipline_source = 'EXTRACTED';
          discipline = meta.discipline;
        }
        patch.search_text = buildSearchText(number, title, discipline);
        await sheetsRepo.update(tx, sheet.id, patch);
      });
    }
  } finally {
    await doc.close();
  }
}

/** Apply a user's metadata edit: set the given fields, mark them USER, rebuild the search entry. */
export async function updateSheetMetadata(
  tx: OrgScopedTx,
  sheetId: string,
  input: UpdateSheetMetadataRequest,
): Promise<SheetView> {
  const current = await sheetsRepo.getById(tx, sheetId);
  if (!current) throw NotFound('Sheet not found');

  const patch: Partial<typeof sheets.$inferInsert> = {};
  let number = current.sheet_number;
  let title = current.sheet_title;
  let discipline = current.discipline;

  if (input.sheetNumber !== undefined) {
    patch.sheet_number = input.sheetNumber;
    patch.sheet_number_source = 'USER';
    number = input.sheetNumber;
  }
  if (input.sheetTitle !== undefined) {
    patch.sheet_title = input.sheetTitle;
    patch.sheet_title_source = 'USER';
    title = input.sheetTitle;
  }
  if (input.discipline !== undefined) {
    patch.discipline = input.discipline;
    patch.discipline_source = 'USER';
    discipline = input.discipline;
  }
  patch.search_text = buildSearchText(number, title, discipline);
  await sheetsRepo.update(tx, sheetId, patch);

  const updated = await sheetsRepo.getById(tx, sheetId);
  return sheetToView(updated!);
}
