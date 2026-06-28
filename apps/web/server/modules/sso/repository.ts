import { and, desc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { ssoConnections } from '../../data/schema';

export type SsoConnection = typeof ssoConnections.$inferSelect;

export const ssoConnectionsRepo = {
  async insert(
    tx: OrgScopedTx,
    values: typeof ssoConnections.$inferInsert,
  ): Promise<SsoConnection> {
    const [row] = await tx.insert(ssoConnections).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<SsoConnection | undefined> {
    return tx.query.ssoConnections.findFirst({
      where: and(eq(ssoConnections.id, id), isNull(ssoConnections.deleted_at)),
    });
  },

  async listByOrg(tx: OrgScopedTx, orgId: string): Promise<SsoConnection[]> {
    return tx.query.ssoConnections.findMany({
      where: and(eq(ssoConnections.org_id, orgId), isNull(ssoConnections.deleted_at)),
      orderBy: [desc(ssoConnections.created_at)],
    });
  },

  /**
   * The active connection that owns an email domain — the login routing lookup. Cross-org by nature
   * (a login doesn't know its org yet), so it runs on the admin connection. The unique-domain index
   * guarantees at most one.
   */
  async getActiveByDomain(tx: OrgScopedTx, domain: string): Promise<SsoConnection | undefined> {
    return tx.query.ssoConnections.findFirst({
      where: and(
        eq(ssoConnections.email_domain, domain),
        eq(ssoConnections.active, true),
        isNull(ssoConnections.deleted_at),
      ),
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof ssoConnections.$inferInsert>,
  ): Promise<SsoConnection> {
    const [row] = await tx
      .update(ssoConnections)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(ssoConnections.id, id))
      .returning();
    return row!;
  },

  async softDelete(tx: OrgScopedTx, id: string): Promise<void> {
    await tx
      .update(ssoConnections)
      .set({ deleted_at: new Date(), active: false, updated_at: new Date() })
      .where(eq(ssoConnections.id, id));
  },
};
