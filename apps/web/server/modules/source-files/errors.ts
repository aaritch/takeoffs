import type { FieldError } from '@takeoff/contracts';

export type SourceFileErrorCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'UPLOAD_VERIFICATION_FAILED';

/** Domain error for the uploads/source-files module; `code` maps onto the API ErrorEnvelope. */
export class SourceFileError extends Error {
  readonly code: SourceFileErrorCode;
  readonly field: string | undefined;
  readonly details: FieldError[] | undefined;
  constructor(
    code: SourceFileErrorCode,
    message: string,
    opts?: { field?: string; details?: FieldError[] },
  ) {
    super(message);
    this.name = 'SourceFileError';
    this.code = code;
    this.field = opts?.field;
    this.details = opts?.details;
  }
}

export const ValidationFailed = (
  message: string,
  opts?: { field?: string; details?: FieldError[] },
) => new SourceFileError('VALIDATION_FAILED', message, opts);
export const NotFound = (message = 'Source file not found') =>
  new SourceFileError('NOT_FOUND', message);
export const VerificationFailed = (message: string) =>
  new SourceFileError('UPLOAD_VERIFICATION_FAILED', message);
