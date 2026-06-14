export type ConditionErrorCode = 'VALIDATION_FAILED' | 'NOT_FOUND';

/** Domain error for the conditions module; `code` maps onto the API ErrorEnvelope. */
export class ConditionError extends Error {
  readonly code: ConditionErrorCode;
  readonly field: string | undefined;
  constructor(code: ConditionErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ConditionError';
    this.code = code;
    this.field = field;
  }
}

export const ValidationFailed = (message: string, field?: string) =>
  new ConditionError('VALIDATION_FAILED', message, field);
export const NotFound = (message = 'Condition not found') =>
  new ConditionError('NOT_FOUND', message);
