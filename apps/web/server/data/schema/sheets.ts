import { pgTable, text, integer, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Discipline, MetadataSource, ScaleStatus } from '@takeoff/contracts';
import { primaryId, timestamps } from './columns';
import { organizations } from './accounts';
import { planSets } from './plan-sets';
import { sourceFiles } from './source-files';

/**
 * Sheet — one page of a plan set (spec §5.2). Created during ingestion (P1-02) as the page
 * inventory: `index_in_set` preserves deterministic page order (downstream sheet numbering
 * depends on it). The raster fields (width/height/dpi, tile/thumbnail keys) are filled by
 * rasterize+tile (P1-03); `sheet_number`/`title`/`discipline` by extraction (P1-04). `org_id`
 * is the RLS key (P0-07).
 */
export const sheets = pgTable(
  'sheets',
  {
    id: primaryId(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    plan_set_id: uuid('plan_set_id')
      .notNull()
      .references(() => planSets.id),
    source_file_id: uuid('source_file_id')
      .notNull()
      .references(() => sourceFiles.id),
    /** 0-based ordinal of this page within its plan set — the deterministic page order. */
    index_in_set: integer('index_in_set').notNull(),
    sheet_number: text('sheet_number'),
    sheet_title: text('sheet_title'),
    discipline: text('discipline').$type<Discipline>().notNull().default('UNKNOWN'),
    // Per-field provenance (P1-04): USER edits win over future re-extraction. NULL = never set.
    sheet_number_source: text('sheet_number_source').$type<MetadataSource>(),
    sheet_title_source: text('sheet_title_source').$type<MetadataSource>(),
    discipline_source: text('discipline_source').$type<MetadataSource>(),
    /** Normalized, searchable text (number + title + discipline) — the sheet's search index entry. */
    search_text: text('search_text'),
    width_px: integer('width_px'),
    height_px: integer('height_px'),
    dpi: integer('dpi'),
    tile_pyramid_key: text('tile_pyramid_key'),
    thumbnail_key: text('thumbnail_key'),
    scale_status: text('scale_status').$type<ScaleStatus>().notNull().default('UNSET'),
    ...timestamps,
  },
  (t) => [
    index('sheets_org_idx').on(t.org_id),
    index('sheets_plan_set_idx').on(t.plan_set_id),
    // One row per (source file, page) — makes the split step idempotent and order unambiguous.
    uniqueIndex('sheets_source_file_index_idx').on(t.source_file_id, t.index_in_set),
  ],
);
