import { randomBytes } from 'node:crypto';
import type { WebhookEventType } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import type { OrgScopedTx } from '../../data/org-scope';
import type { webhookDeliveries } from '../../data/schema';
import { isTransient, nextAttemptAt } from './retry';
import { EVENT_ID_HEADER, EVENT_TYPE_HEADER, SIGNATURE_HEADER, signPayload } from './signing';
import { httpWebhookSender, type WebhookSender } from './sender';
import {
  webhookDeliveriesRepo,
  webhookEndpointsRepo,
  type WebhookDelivery,
  type WebhookEndpoint,
} from './repository';

export interface CreateEndpointInput {
  orgId: string;
  url: string;
  eventTypes: WebhookEventType[];
  description?: string;
}

export interface EmitInput {
  orgId: string;
  eventType: WebhookEventType;
  /** Stable idempotency key for this logical event (sent to the consumer; reused across retries). */
  eventId: string;
  /** Non-sensitive fields the subscriber needs — never internal/secret data (the caveat). */
  data: Record<string, unknown>;
}

export interface DeliveryDeps {
  sender: WebhookSender;
  now: Date;
}
function defaults(): DeliveryDeps {
  return { sender: httpWebhookSender, now: new Date() };
}

/** A per-endpoint signing secret (shown once at creation). */
function generateSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/**
 * Outbound webhooks (P5-03). Customer orgs subscribe endpoints to events; we deliver SIGNED, RETRIED,
 * IDEMPOTENT POSTs. Subscription management is org-scoped (customer connection); emit + delivery run
 * platform-side (the worker/admin connection) because the retry sweep spans orgs.
 */
export const webhookService = {
  async createEndpoint(
    tx: OrgScopedTx,
    input: CreateEndpointInput,
  ): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    const secret = generateSecret();
    const endpoint = await webhookEndpointsRepo.insert(tx, {
      org_id: input.orgId,
      url: input.url,
      secret,
      event_types: input.eventTypes,
      active: true,
      description: input.description ?? null,
    });
    return { endpoint, secret };
  },

  listEndpoints(tx: OrgScopedTx, orgId: string): Promise<WebhookEndpoint[]> {
    return webhookEndpointsRepo.listByOrg(tx, orgId);
  },

  deleteEndpoint(tx: OrgScopedTx, id: string): Promise<void> {
    return webhookEndpointsRepo.softDelete(tx, id);
  },

  listDeliveries(tx: OrgScopedTx, endpointId: string): Promise<WebhookDelivery[]> {
    return webhookDeliveriesRepo.listByEndpoint(tx, endpointId);
  },

  /**
   * Fan an event out to every active endpoint in the org subscribed to it, creating one PENDING
   * delivery per endpoint (idempotent on endpoint+event_id). Returns the deliveries; the retry sweep
   * actually sends them. The payload carries only `data` — keep it to what the subscriber needs.
   */
  async emit(db: DB, input: EmitInput): Promise<WebhookDelivery[]> {
    return db.transaction(async (tx) => {
      const endpoints = await webhookEndpointsRepo.listActiveForEvent(
        tx,
        input.orgId,
        input.eventType,
      );
      const deliveries: WebhookDelivery[] = [];
      for (const endpoint of endpoints) {
        deliveries.push(
          await webhookDeliveriesRepo.insertIfAbsent(tx, {
            org_id: input.orgId,
            endpoint_id: endpoint.id,
            event_type: input.eventType,
            event_id: input.eventId,
            payload: { id: input.eventId, type: input.eventType, data: input.data },
            status: 'PENDING',
          }),
        );
      }
      return deliveries;
    });
  },

  /**
   * Attempt ONE delivery: build the signed request and send it. The event id (idempotency key) and
   * signature are identical across retries, so a consumer can dedupe and verify. A 2xx → DELIVERED; a
   * transient failure → schedule a retry (or FAILED once attempts are exhausted); a permanent 4xx →
   * FAILED. The external send happens OUTSIDE a DB transaction.
   */
  async attemptDelivery(
    db: DB,
    deliveryId: string,
    deps: DeliveryDeps = defaults(),
  ): Promise<WebhookDelivery> {
    const loaded = await db.transaction(async (tx) => {
      const delivery = await webhookDeliveriesRepo.getById(tx, deliveryId);
      if (!delivery || delivery.status !== 'PENDING') return { delivery, endpoint: undefined };
      const endpoint = await webhookEndpointsRepo.getById(tx, delivery.endpoint_id);
      return { delivery, endpoint };
    });
    const { delivery, endpoint } = loaded;
    if (!delivery) throw new Error('Delivery not found');
    if (delivery.status !== 'PENDING') return delivery;

    const attempt = delivery.attempt_count + 1;
    if (!endpoint) {
      return db.transaction((tx) =>
        webhookDeliveriesRepo.update(tx, deliveryId, {
          status: 'FAILED',
          attempt_count: attempt,
          last_error: 'Endpoint no longer exists',
          next_attempt_at: null,
        }),
      );
    }

    const body = JSON.stringify(delivery.payload);
    const ts = Math.floor(deps.now.getTime() / 1000);
    const result = await deps.sender.send({
      url: endpoint.url,
      headers: {
        'content-type': 'application/json',
        [EVENT_ID_HEADER]: delivery.event_id,
        [EVENT_TYPE_HEADER]: delivery.event_type,
        [SIGNATURE_HEADER]: signPayload(endpoint.secret, ts, body),
      },
      body,
    });

    const patch: Partial<typeof webhookDeliveries.$inferInsert> = {
      attempt_count: attempt,
      last_status_code: result.statusCode,
      last_error: result.ok ? null : (result.error ?? `HTTP ${result.statusCode}`),
    };
    if (result.ok) {
      Object.assign(patch, { status: 'DELIVERED', delivered_at: deps.now, next_attempt_at: null });
    } else if (isTransient(result.statusCode)) {
      const next = nextAttemptAt(attempt, deps.now, delivery.max_attempts);
      Object.assign(
        patch,
        next
          ? { status: 'PENDING', next_attempt_at: next }
          : { status: 'FAILED', next_attempt_at: null },
      );
    } else {
      Object.assign(patch, { status: 'FAILED', next_attempt_at: null });
    }
    return db.transaction((tx) => webhookDeliveriesRepo.update(tx, deliveryId, patch));
  },

  /** The retry sweep (worker/cron): attempt every delivery currently due. Returns the results. */
  async deliverDue(db: DB, now: Date, deps?: Partial<DeliveryDeps>): Promise<WebhookDelivery[]> {
    const due = await db.transaction((tx) => webhookDeliveriesRepo.listDue(tx, now));
    const results: WebhookDelivery[] = [];
    for (const d of due) {
      results.push(
        await this.attemptDelivery(db, d.id, { sender: deps?.sender ?? httpWebhookSender, now }),
      );
    }
    return results;
  },
};
