import { and, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { projects } from '../../data/schema';

export type Project = typeof projects.$inferSelect;

/**
 * Projects data access. Every function takes the org-scoped transaction from `withOrgScope`;
 * org isolation is enforced by RLS at the database, so these queries do not (and cannot) leak
 * across orgs even though they carry no explicit org_id filter. A cross-org update/delete simply
 * affects zero rows; a cross-org insert is rejected by the policy's WITH CHECK.
 */
export const projectsRepo = {
  async insert(tx: OrgScopedTx, values: typeof projects.$inferInsert): Promise<Project> {
    const [row] = await tx.insert(projects).values(values).returning();
    return row!;
  },

  async listLive(tx: OrgScopedTx): Promise<Project[]> {
    return tx.query.projects.findMany({ where: isNull(projects.deleted_at) });
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Project | undefined> {
    return tx.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deleted_at)),
    });
  },

  /** Returns the number of rows actually changed (0 if not visible to the current org). */
  async rename(tx: OrgScopedTx, id: string, name: string): Promise<number> {
    const rows = await tx
      .update(projects)
      .set({ name, updated_at: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return rows.length;
  },

  /** Returns the number of rows actually deleted (0 if not visible to the current org). */
  async remove(tx: OrgScopedTx, id: string): Promise<number> {
    const rows = await tx
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return rows.length;
  },
};
