/**
 * Accounts domain errors. Each carries a stable machine `code` that maps onto the API
 * ErrorEnvelope (contracts §http) when surfaced over HTTP (wiring lands with the routes in
 * P0-05). Thrown by the service; never leak raw DB errors past this boundary.
 */
export type AccountsErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SEAT_LIMIT_EXCEEDED'
  | 'LAST_OWNER';

export class AccountsError extends Error {
  readonly code: AccountsErrorCode;
  constructor(code: AccountsErrorCode, message: string) {
    super(message);
    this.name = 'AccountsError';
    this.code = code;
  }
}

export const Forbidden = (message = 'Not permitted') => new AccountsError('FORBIDDEN', message);
export const NotFound = (message = 'Not found') => new AccountsError('NOT_FOUND', message);
export const Conflict = (message: string) => new AccountsError('CONFLICT', message);
export const SeatLimitExceeded = (message: string) =>
  new AccountsError('SEAT_LIMIT_EXCEEDED', message);
export const LastOwner = (message: string) => new AccountsError('LAST_OWNER', message);
