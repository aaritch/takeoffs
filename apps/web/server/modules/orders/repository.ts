import { and, asc, count, desc, eq, inArray, isNull, lte, notInArray } from 'drizzle-orm';
import type { OrderStatus } from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { orderEvents, orders } from '../../data/schema';

export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;

/** Statuses where an order still occupies an estimator's concurrent-order capacity (P3-04). */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly OrderStatus[] = [
  'ASSIGNED',
  'IN_PROGRESS',
  'IN_QA',
  'REVISIONS',
];

/** Orders + append-only OrderEvent data access, org-scoped via RLS (run inside withOrgScope). */
export const ordersRepo = {
  async insert(tx: OrgScopedTx, values: typeof orders.$inferInsert): Promise<Order> {
    const [row] = await tx.insert(orders).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Order | undefined> {
    return tx.query.orders.findFirst({
      where: and(eq(orders.id, id), isNull(orders.deleted_at)),
    });
  },

  async listByOrg(tx: OrgScopedTx): Promise<Order[]> {
    return tx.query.orders.findMany({
      where: isNull(orders.deleted_at),
      orderBy: [desc(orders.created_at)],
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof orders.$inferInsert>,
  ): Promise<Order | undefined> {
    const [row] = await tx
      .update(orders)
      .set({ ...patch, updated_at: new Date() })
      .where(and(eq(orders.id, id), isNull(orders.deleted_at)))
      .returning();
    return row;
  },

  /** Append an immutable audit event. Never updated or deleted. */
  async appendEvent(tx: OrgScopedTx, values: typeof orderEvents.$inferInsert): Promise<OrderEvent> {
    const [row] = await tx.insert(orderEvents).values(values).returning();
    return row!;
  },

  async listEvents(tx: OrgScopedTx, orderId: string): Promise<OrderEvent[]> {
    // Chronological; the uuid v7 id breaks ties so events written in the same ms keep insertion order.
    return tx.query.orderEvents.findMany({
      where: eq(orderEvents.order_id, orderId),
      orderBy: [asc(orderEvents.occurred_at), asc(orderEvents.id)],
    });
  },

  /**
   * DELIVERED orders whose dispute window has lapsed (delivered_at ≤ cutoff) — the auto-accept
   * sweep set (P3-07). Cross-org; run on the platform/admin connection.
   */
  /**
   * The live ops queue: every non-terminal order across all orgs (P3-08), newest first. Cross-org;
   * run on the platform/admin connection.
   */
  async listQueue(tx: OrgScopedTx): Promise<Order[]> {
    return tx.query.orders.findMany({
      where: and(notInArray(orders.status, ['ACCEPTED', 'CANCELLED']), isNull(orders.deleted_at)),
      orderBy: [desc(orders.created_at)],
    });
  },

  async listDeliveredBefore(tx: OrgScopedTx, cutoff: Date): Promise<Order[]> {
    return tx.query.orders.findMany({
      where: and(
        eq(orders.status, 'DELIVERED'),
        lte(orders.delivered_at, cutoff),
        isNull(orders.deleted_at),
      ),
    });
  },

  /**
   * How many active orders an estimator currently holds (across all orgs) — their live capacity
   * load (P3-04). Run on the platform/admin connection, which sees orders cross-org.
   */
  async countActiveByEstimator(tx: OrgScopedTx, estimatorId: string): Promise<number> {
    const [row] = await tx
      .select({ cnt: count() })
      .from(orders)
      .where(
        and(
          eq(orders.assigned_estimator_id, estimatorId),
          inArray(orders.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
          isNull(orders.deleted_at),
        ),
      );
    return Number(row?.cnt ?? 0);
  },
};
