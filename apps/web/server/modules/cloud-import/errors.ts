export type CloudImportErrorCode =
  | 'PERMISSION_DENIED'
  | 'FETCH_FAILED'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE';

/**
 * Cloud-import failure (P5-05). A permission/fetch failure or a file that fails the SAME validation
 * as an upload — surfaced clearly to the customer, never producing a half-imported set.
 */
export class CloudImportError extends Error {
  readonly code: CloudImportErrorCode;
  constructor(code: CloudImportErrorCode, message: string) {
    super(message);
    this.name = 'CloudImportError';
    this.code = code;
  }
}
