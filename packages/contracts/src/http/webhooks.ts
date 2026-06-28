import { z } from 'zod';
import { WebhookDeliveryStatus, WebhookEventType } from '../enums/webhooks';

/**
 * Outbound webhooks (P5-03) — a customer org subscribes an endpoint to events; we deliver signed,
 * retried, idempotent POSTs. The signing secret is returned ONCE at creation and never again.
 */

export const WebhookEndpointView = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  eventTypes: z.array(WebhookEventType),
  active: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type WebhookEndpointView = z.infer<typeof WebhookEndpointView>;

/** POST /v1/webhooks/endpoints. The response (only) includes the signing `secret` — shown once. */
export const CreateWebhookEndpointRequest = z.object({
  url: z.string().url(),
  eventTypes: z.array(WebhookEventType).min(1),
  description: z.string().optional(),
});
export type CreateWebhookEndpointRequest = z.infer<typeof CreateWebhookEndpointRequest>;

export const CreateWebhookEndpointResponse = z.object({
  endpoint: WebhookEndpointView,
  secret: z.string(),
});
export type CreateWebhookEndpointResponse = z.infer<typeof CreateWebhookEndpointResponse>;

export const WebhookEndpointsResponse = z.object({ endpoints: z.array(WebhookEndpointView) });
export type WebhookEndpointsResponse = z.infer<typeof WebhookEndpointsResponse>;

/** A delivery attempt record, for the customer to inspect retries/failures. */
export const WebhookDeliveryView = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  eventType: WebhookEventType,
  eventId: z.string().uuid(),
  status: WebhookDeliveryStatus,
  attemptCount: z.number().int(),
  lastStatusCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type WebhookDeliveryView = z.infer<typeof WebhookDeliveryView>;

export const WebhookDeliveriesResponse = z.object({ deliveries: z.array(WebhookDeliveryView) });
export type WebhookDeliveriesResponse = z.infer<typeof WebhookDeliveriesResponse>;
