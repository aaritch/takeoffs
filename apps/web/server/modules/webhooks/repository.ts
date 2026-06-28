import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type { WebhookEventType } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { webhookDeliveries, webhookEndpoints } from '../../data/schema';

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

export const webhookEndpointsRepo = {
  async insert(
    tx: OrgScopedTx,
    values: typeof webhookEndpoints.$inferInsert,
  ): Promise<WebhookEndpoint> {
    const [row] = await tx.insert(webhookEndpoints).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<WebhookEndpoint | undefined> {
    return tx.query.webhookEndpoints.findFirst({
      where: and(eq(webhookEndpoints.id, id), isNull(webhookEndpoints.deleted_at)),
    });
  },

  async listByOrg(tx: OrgScopedTx, orgId: string): Promise<WebhookEndpoint[]> {
    return tx.query.webhookEndpoints.findMany({
      where: and(eq(webhookEndpoints.org_id, orgId), isNull(webhookEndpoints.deleted_at)),
      orderBy: [desc(webhookEndpoints.created_at)],
    });
  },

  /** Active endpoints in an org subscribed to `eventType` (the fan-out target for emit). */
  async listActiveForEvent(
    tx: OrgScopedTx,
    orgId: string,
    eventType: WebhookEventType,
  ): Promise<WebhookEndpoint[]> {
    const all = await tx.query.webhookEndpoints.findMany({
      where: and(
        eq(webhookEndpoints.org_id, orgId),
        eq(webhookEndpoints.active, true),
        isNull(webhookEndpoints.deleted_at),
      ),
    });
    return all.filter((e) => e.event_types.includes(eventType));
  },

  async softDelete(tx: OrgScopedTx, id: string): Promise<void> {
    await tx
      .update(webhookEndpoints)
      .set({ deleted_at: new Date(), active: false, updated_at: new Date() })
      .where(eq(webhookEndpoints.id, id));
  },
};

export const webhookDeliveriesRepo = {
  /** Create a delivery, or return the existing one for (endpoint, event) — idempotent emit. */
  async insertIfAbsent(
    tx: OrgScopedTx,
    values: typeof webhookDeliveries.$inferInsert,
  ): Promise<WebhookDelivery> {
    const [row] = await tx
      .insert(webhookDeliveries)
      .values(values)
      .onConflictDoNothing({
        target: [webhookDeliveries.endpoint_id, webhookDeliveries.event_id],
      })
      .returning();
    if (row) return row;
    return (await tx.query.webhookDeliveries.findFirst({
      where: and(
        eq(webhookDeliveries.endpoint_id, values.endpoint_id),
        eq(webhookDeliveries.event_id, values.event_id),
      ),
    }))!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<WebhookDelivery | undefined> {
    return tx.query.webhookDeliveries.findFirst({ where: eq(webhookDeliveries.id, id) });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof webhookDeliveries.$inferInsert>,
  ): Promise<WebhookDelivery> {
    const [row] = await tx
      .update(webhookDeliveries)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(webhookDeliveries.id, id))
      .returning();
    return row!;
  },

  /** PENDING deliveries due for an attempt (never attempted, or whose backoff has elapsed). */
  async listDue(tx: OrgScopedTx, now: Date, limit = 100): Promise<WebhookDelivery[]> {
    return tx.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, 'PENDING'),
        or(isNull(webhookDeliveries.next_attempt_at), lte(webhookDeliveries.next_attempt_at, now)),
      ),
      limit,
    });
  },

  async listByEndpoint(tx: OrgScopedTx, endpointId: string): Promise<WebhookDelivery[]> {
    return tx.query.webhookDeliveries.findMany({
      where: eq(webhookDeliveries.endpoint_id, endpointId),
      orderBy: [desc(webhookDeliveries.created_at)],
    });
  },
};
