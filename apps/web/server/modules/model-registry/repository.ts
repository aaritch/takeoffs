import { and, desc, eq, isNull } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { modelVersions } from '../../data/schema';

export type ModelVersion = typeof modelVersions.$inferSelect;

/**
 * Model version registry — platform-global (no org_id); read/written on the admin connection. The
 * inference plane reads the ACTIVE row per family to serve; the app records it on every ModelRun.
 */
export const modelVersionsRepo = {
  async insert(tx: OrgScopedTx, values: typeof modelVersions.$inferInsert): Promise<ModelVersion> {
    const [row] = await tx.insert(modelVersions).values(values).returning();
    return row!;
  },

  getByFamilyVersion(
    tx: OrgScopedTx,
    modelFamily: string,
    version: string,
  ): Promise<ModelVersion | undefined> {
    return tx.query.modelVersions.findFirst({
      where: and(
        eq(modelVersions.model_family, modelFamily),
        eq(modelVersions.version, version),
        isNull(modelVersions.deleted_at),
      ),
    });
  },

  getById(tx: OrgScopedTx, id: string): Promise<ModelVersion | undefined> {
    return tx.query.modelVersions.findFirst({
      where: and(eq(modelVersions.id, id), isNull(modelVersions.deleted_at)),
    });
  },

  /** The single ACTIVE (served) version for a family, if any. */
  getActive(tx: OrgScopedTx, modelFamily: string): Promise<ModelVersion | undefined> {
    return tx.query.modelVersions.findFirst({
      where: and(
        eq(modelVersions.model_family, modelFamily),
        eq(modelVersions.status, 'ACTIVE'),
        isNull(modelVersions.deleted_at),
      ),
    });
  },

  /** Every ACTIVE version across all families — the serving set stamped onto runs. */
  listActive(tx: OrgScopedTx): Promise<ModelVersion[]> {
    return tx.query.modelVersions.findMany({
      where: and(eq(modelVersions.status, 'ACTIVE'), isNull(modelVersions.deleted_at)),
    });
  },

  listByFamily(tx: OrgScopedTx, modelFamily: string): Promise<ModelVersion[]> {
    return tx.query.modelVersions.findMany({
      where: and(eq(modelVersions.model_family, modelFamily), isNull(modelVersions.deleted_at)),
      orderBy: [desc(modelVersions.created_at)],
    });
  },

  listRecent(tx: OrgScopedTx, limit = 100): Promise<ModelVersion[]> {
    return tx.query.modelVersions.findMany({
      where: isNull(modelVersions.deleted_at),
      orderBy: [desc(modelVersions.created_at)],
      limit,
    });
  },

  async update(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof modelVersions.$inferInsert>,
  ): Promise<ModelVersion> {
    const [row] = await tx
      .update(modelVersions)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(modelVersions.id, id))
      .returning();
    return row!;
  },
};
