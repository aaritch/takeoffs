// Webhooks module (P5-03) — customer orgs subscribe endpoints to events (takeoff complete, order
// delivered) and we deliver SIGNED, RETRIED, IDEMPOTENT POSTs to their tooling. The event id is the
// idempotency key (stable across retries); each delivery is HMAC-signed with the endpoint secret;
// transient failures back off and retry. Payloads carry only what the subscriber needs.
export { webhookService } from './service';
export type { CreateEndpointInput, EmitInput, DeliveryDeps } from './service';
export { endpointToView, deliveryToView } from './view';
export {
  webhookEndpointsRepo,
  webhookDeliveriesRepo,
  type WebhookEndpoint,
  type WebhookDelivery,
} from './repository';
export {
  signPayload,
  verifySignature,
  SIGNATURE_HEADER,
  EVENT_ID_HEADER,
  EVENT_TYPE_HEADER,
} from './signing';
export { isTransient, nextAttemptAt, backoffSeconds, MAX_ATTEMPTS } from './retry';
export {
  httpWebhookSender,
  type WebhookSender,
  type WebhookRequest,
  type WebhookSendResult,
} from './sender';
