import { z } from 'zod';

/**
 * The consistent error envelope every endpoint returns on failure (spec §12.1):
 * a machine-readable code, a human-readable message, and optional field-level details.
 */
export const FieldError = z.object({
  /** Dotted path to the offending field, e.g. "conditions.0.unit". */
  field: z.string(),
  /** Human-readable reason this field failed. */
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldError>;

export const ErrorEnvelope = z.object({
  /** Stable machine code, UPPER_SNAKE_CASE, e.g. "VALIDATION_FAILED", "NOT_FOUND". */
  code: z.string().min(1),
  /** Human-readable summary safe to surface to the user. */
  message: z.string().min(1),
  /** Per-field validation details, when applicable. */
  details: z.array(FieldError).optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
