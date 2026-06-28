import type {
  WebhookDeliveryView,
  WebhookEndpointView,
  WebhookEventType,
} from '@takeoff/contracts';
import type { WebhookDelivery, WebhookEndpoint } from './repository';

/** Endpoint view — note the signing secret is NEVER serialized here (returned once at creation only). */
export function endpointToView(e: WebhookEndpoint): WebhookEndpointView {
  return {
    id: e.id,
    url: e.url,
    // text[] selects as string[]; the values are validated against WebhookEventType at create time.
    eventTypes: e.event_types as WebhookEventType[],
    active: e.active,
    description: e.description,
    createdAt: e.created_at.toISOString(),
  };
}

export function deliveryToView(d: WebhookDelivery): WebhookDeliveryView {
  return {
    id: d.id,
    endpointId: d.endpoint_id,
    eventType: d.event_type,
    eventId: d.event_id,
    status: d.status,
    attemptCount: d.attempt_count,
    lastStatusCode: d.last_status_code,
    lastError: d.last_error,
    nextAttemptAt: d.next_attempt_at?.toISOString() ?? null,
    deliveredAt: d.delivered_at?.toISOString() ?? null,
    createdAt: d.created_at.toISOString(),
  };
}
