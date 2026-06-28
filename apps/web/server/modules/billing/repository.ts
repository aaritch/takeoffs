import { and, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { billingEvents, subscriptions } from '../../data/schema';

export type Subscription = typeof subscriptions.$inferSelect;
export type BillingEvent = typeof billingEvents.$inferSelect;

/**
 * Subscriptions are org-scoped (RLS); the webhook reconciler writes them on the admin connection
 * (cross-org, like orders/assignment), customers read their own under withOrgScope.
 */
export const subscriptionsRepo = {
  async getByOrg(tx: OrgScopedTx, orgId: string): Promise<Subscription | undefined> {
    return tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.org_id, orgId), isNull(subscriptions.deleted_at)),
    });
  },

  async insert(tx: OrgScopedTx, values: typeof subscriptions.$inferInsert): Promise<Subscription> {
    const [row] = await tx.insert(subscriptions).values(values).returning();
    return row!;
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof subscriptions.$inferInsert>,
  ): Promise<Subscription> {
    const [row] = await tx
      .update(subscriptions)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return row!;
  },
};

export const billingEventsRepo = {
  /**
   * Record a provider event exactly once. Returns true if this is the FIRST time we've seen it (and
   * it should be processed), false if it's a duplicate delivery (already recorded — skip). The unique
   * constraint on provider_event_id makes this the idempotency gate.
   */
  async recordOnce(tx: OrgScopedTx, values: typeof billingEvents.$inferInsert): Promise<boolean> {
    const rows = await tx
      .insert(billingEvents)
      .values(values)
      .onConflictDoNothing({ target: billingEvents.provider_event_id })
      .returning();
    return rows.length > 0;
  },
};
