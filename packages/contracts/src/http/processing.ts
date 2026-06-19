import { z } from 'zod';
import { IngestStatus, PlanSetProcessingStatus } from '../enums/projects';

/**
 * Processing-status shapes (P1-05). Granular per-file AND per-sheet progress so the client can
 * show what's READY vs pending — never a single opaque spinner — and surface a failed file with a
 * retry. `ready` means the sheet has tiles and is viewable, so early sheets open before the whole
 * set finishes.
 */

export const SheetStatus = z.object({
  id: z.string().uuid(),
  indexInSet: z.number().int().nonnegative(),
  sheetNumber: z.string().nullable(),
  thumbnailKey: z.string().nullable(),
  /** Tiles exist → the sheet can be opened in the viewer. */
  ready: z.boolean(),
});
export type SheetStatus = z.infer<typeof SheetStatus>;

export const SourceFileStatus = z.object({
  id: z.string().uuid(),
  originalFilename: z.string(),
  ingestStatus: IngestStatus,
  errorDetail: z.string().nullable(),
  pageCount: z.number().int().nonnegative().nullable(),
  sheets: z.array(SheetStatus),
});
export type SourceFileStatus = z.infer<typeof SourceFileStatus>;

export const ProcessingStatusView = z.object({
  planSet: z.object({
    id: z.string().uuid(),
    processingStatus: PlanSetProcessingStatus,
    sourceFileCount: z.number().int().nonnegative(),
    totalSheetCount: z.number().int().nonnegative(),
  }),
  sourceFiles: z.array(SourceFileStatus),
});
export type ProcessingStatusView = z.infer<typeof ProcessingStatusView>;
