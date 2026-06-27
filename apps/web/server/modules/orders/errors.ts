import type { OrderStatus } from '@takeoff/contracts';

export type OrderErrorCode =
  | 'NOT_FOUND'
  | 'ILLEGAL_TRANSITION'
  | 'VALIDATION_FAILED'
  | 'PAYMENT_REQUIRED';

/** Domain error for the orders module; `code` maps onto the API ErrorEnvelope (P3-01). */
export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly field: string | undefined;
  constructor(code: OrderErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.field = field;
  }
}

export const NotFound = (message = 'Order not found') => new OrderError('NOT_FOUND', message);
export const ValidationFailed = (message: string, field?: string) =>
  new OrderError('VALIDATION_FAILED', message, field);
export const IllegalTransition = (from: OrderStatus, to: OrderStatus) =>
  new OrderError('ILLEGAL_TRANSITION', `An order cannot move from ${from} to ${to}.`);
export const PaymentRequired = (message: string) => new OrderError('PAYMENT_REQUIRED', message);
