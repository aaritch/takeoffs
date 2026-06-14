export type MeasurementErrorCode = 'VALIDATION_FAILED' | 'NOT_FOUND';

export class MeasurementError extends Error {
  readonly code: MeasurementErrorCode;
  readonly field: string | undefined;
  constructor(code: MeasurementErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'MeasurementError';
    this.code = code;
    this.field = field;
  }
}

export const ValidationFailed = (message: string, field?: string) =>
  new MeasurementError('VALIDATION_FAILED', message, field);
export const NotFound = (message = 'Measurement not found') =>
  new MeasurementError('NOT_FOUND', message);
