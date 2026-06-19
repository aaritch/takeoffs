import { z } from 'zod';
import { Discipline, ScaleStatus } from '../enums/projects';

/** Sheet HTTP shapes (P1-04). Metadata fields are user-editable candidates. */

export const SheetView = z.object({
  id: z.string().uuid(),
  planSetId: z.string().uuid(),
  sourceFileId: z.string().uuid(),
  indexInSet: z.number().int().nonnegative(),
  sheetNumber: z.string().nullable(),
  sheetTitle: z.string().nullable(),
  discipline: Discipline,
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
  dpi: z.number().int().positive().nullable(),
  tilePyramidKey: z.string().nullable(),
  thumbnailKey: z.string().nullable(),
  scaleStatus: ScaleStatus,
  createdAt: z.string().datetime(),
});
export type SheetView = z.infer<typeof SheetView>;

/** PATCH /v1/sheets/{id} — edit metadata; any field set wins over future re-extraction. */
export const UpdateSheetMetadataRequest = z
  .object({
    sheetNumber: z.string().max(64).nullable(),
    sheetTitle: z.string().max(200).nullable(),
    discipline: Discipline,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateSheetMetadataRequest = z.infer<typeof UpdateSheetMetadataRequest>;

export const SheetMetadataResponse = z.object({ sheet: SheetView });
export type SheetMetadataResponse = z.infer<typeof SheetMetadataResponse>;
