import { z } from 'zod';
import { MeasurementType, Unit } from '../enums';

/**
 * Condition HTTP shapes for the measurement toolbar (P1-09/P1-10). Conditions are the trade
 * quantity buckets a drawn measurement attaches to; the toolbar lists them for the active sheet
 * and can create a new one inline.
 */

export const ConditionView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  measurementType: MeasurementType,
  unit: Unit,
  colorHex: z.string().nullable(),
});
export type ConditionView = z.infer<typeof ConditionView>;

/** POST /v1/sheets/{id}/conditions — create a condition on the sheet's takeoff. */
export const CreateConditionRequest = z.object({
  name: z.string().min(1).max(120),
  measurementType: MeasurementType,
  unit: Unit,
});
export type CreateConditionRequest = z.infer<typeof CreateConditionRequest>;

export const ConditionsListResponse = z.object({ conditions: z.array(ConditionView) });
export type ConditionsListResponse = z.infer<typeof ConditionsListResponse>;
