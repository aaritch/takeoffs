import { z } from 'zod';

/**
 * Outbound webhook event types (spec §8, P5-03) — the events a customer org can subscribe to for
 * their own tooling. Payloads carry only what the subscriber needs (webhooks leave our trust
 * boundary — the caveat), never internal/sensitive data.
 */
export const WebhookEventType = z.enum(['TAKEOFF_COMPLETED', 'ORDER_DELIVERED', 'ORDER_ACCEPTED']);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

/** Delivery lifecycle: PENDING (queued / awaiting retry) → DELIVERED, or → FAILED (exhausted/permanent). */
export const WebhookDeliveryStatus = z.enum(['PENDING', 'DELIVERED', 'FAILED']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatus>;
