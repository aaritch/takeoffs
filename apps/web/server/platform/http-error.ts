import type { FieldError } from '@takeoff/contracts';

/**
 * A thrown HTTP error carrying a status + machine code, mapped to the standard ErrorEnvelope by the
 * route harness. Lives here (free of any Next.js / auth imports) so pure logic and tests can use it.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
