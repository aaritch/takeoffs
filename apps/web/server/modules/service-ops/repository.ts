import { and, eq } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { serviceProfiles } from '../../data/schema';

export type ServiceProfile = typeof serviceProfiles.$inferSelect;

/**
 * Service-profile (fulfillment staff) data access. Platform-side: profiles have no org_id, so these
 * run on the admin/platform connection, which sees them across orgs (P3-04).
 */
export const serviceProfilesRepo = {
  async getById(tx: OrgScopedTx, id: string): Promise<ServiceProfile | undefined> {
    return tx.query.serviceProfiles.findFirst({ where: eq(serviceProfiles.id, id) });
  },

  async listActiveEstimators(tx: OrgScopedTx): Promise<ServiceProfile[]> {
    return tx.query.serviceProfiles.findMany({
      where: and(eq(serviceProfiles.role, 'SERVICE_ESTIMATOR'), eq(serviceProfiles.active, true)),
    });
  },

  /** Update the cached live capacity load (recomputed from the order count as orders move). */
  async setCurrentCapacity(tx: OrgScopedTx, id: string, load: number): Promise<void> {
    await tx
      .update(serviceProfiles)
      .set({ current_capacity: load, updated_at: new Date() })
      .where(eq(serviceProfiles.id, id));
  },
};
