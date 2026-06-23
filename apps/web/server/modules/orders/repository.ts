import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { orderEvents, orders } from '../../data/schema';

export type Order = typeof orders.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;

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
    return tx.query.orderEvents.findMany({
      where: eq(orderEvents.order_id, orderId),
      orderBy: [asc(orderEvents.occurred_at)],
    });
  },
};
