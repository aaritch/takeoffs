import { and, eq, isNull, sql } from 'drizzle-orm';
import type { OrgScopedTx } from '../../data/org-scope';
import { assemblies, assemblyComponents, assemblyInstances, sheets } from '../../data/schema';

export type Assembly = typeof assemblies.$inferSelect;
export type AssemblyComponent = typeof assemblyComponents.$inferSelect;
export type AssemblyInstance = typeof assemblyInstances.$inferSelect;

/** Assemblies, their weighted components, and drawn instances — org-scoped (RLS). */
export const assembliesRepo = {
  async insert(tx: OrgScopedTx, values: typeof assemblies.$inferInsert): Promise<Assembly> {
    const [row] = await tx.insert(assemblies).values(values).returning();
    return row!;
  },

  async getById(tx: OrgScopedTx, id: string): Promise<Assembly | undefined> {
    return tx.query.assemblies.findFirst({
      where: and(eq(assemblies.id, id), isNull(assemblies.deleted_at)),
    });
  },

  async listByTakeoff(tx: OrgScopedTx, takeoffId: string): Promise<Assembly[]> {
    return tx.query.assemblies.findMany({
      where: and(eq(assemblies.takeoff_id, takeoffId), isNull(assemblies.deleted_at)),
    });
  },

  async insertComponent(
    tx: OrgScopedTx,
    values: typeof assemblyComponents.$inferInsert,
  ): Promise<AssemblyComponent> {
    const [row] = await tx.insert(assemblyComponents).values(values).returning();
    return row!;
  },

  async listComponents(tx: OrgScopedTx, assemblyId: string): Promise<AssemblyComponent[]> {
    return tx.query.assemblyComponents.findMany({
      where: and(
        eq(assemblyComponents.assembly_id, assemblyId),
        isNull(assemblyComponents.deleted_at),
      ),
    });
  },

  async insertInstance(
    tx: OrgScopedTx,
    values: typeof assemblyInstances.$inferInsert,
  ): Promise<AssemblyInstance> {
    const [row] = await tx.insert(assemblyInstances).values(values).returning();
    return row!;
  },

  async getInstanceById(tx: OrgScopedTx, id: string): Promise<AssemblyInstance | undefined> {
    return tx.query.assemblyInstances.findFirst({
      where: and(eq(assemblyInstances.id, id), isNull(assemblyInstances.deleted_at)),
    });
  },

  async updateInstance(
    tx: OrgScopedTx,
    id: string,
    patch: Partial<typeof assemblyInstances.$inferInsert>,
  ): Promise<AssemblyInstance> {
    const [row] = await tx
      .update(assemblyInstances)
      .set({ ...patch, updated_at: new Date() })
      .where(eq(assemblyInstances.id, id))
      .returning();
    return row!;
  },

  async softDeleteInstance(tx: OrgScopedTx, id: string): Promise<void> {
    await tx
      .update(assemblyInstances)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(assemblyInstances.id, id));
  },

  /**
   * A condition's quantity contribution from assemblies: Σ over its components of
   * (Σ the component's assembly's live instance base_values) × factor, plus the instance count.
   * This is the additive bridge that makes a child condition's rollup reflect assembly draws.
   *
   * `confirmedScaleOnly` mirrors the measurement scale gate (P2-05): for a FINAL report, an instance
   * on an unconfirmed-scale sheet is provisional and excluded; a sheet-less instance has no scale to
   * confirm and is always counted.
   */
  async contributionForCondition(
    tx: OrgScopedTx,
    conditionId: string,
    opts: { confirmedScaleOnly?: boolean } = {},
  ): Promise<{ sum: number; count: number }> {
    const scaleOk = opts.confirmedScaleOnly
      ? sql`and (${assemblyInstances.sheet_id} is null or ${sheets.scale_status} = 'CONFIRMED')`
      : sql``;
    const [row] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${assemblyInstances.base_value} * ${assemblyComponents.factor}), 0)`,
        cnt: sql<string>`count(${assemblyInstances.id})`,
      })
      .from(assemblyComponents)
      .innerJoin(
        assemblyInstances,
        and(
          eq(assemblyInstances.assembly_id, assemblyComponents.assembly_id),
          isNull(assemblyInstances.deleted_at),
        ),
      )
      .leftJoin(sheets, eq(sheets.id, assemblyInstances.sheet_id))
      .where(
        sql`${assemblyComponents.condition_id} = ${conditionId} and ${assemblyComponents.deleted_at} is null ${scaleOk}`,
      );
    return { sum: Number(row?.sum ?? 0), count: Number(row?.cnt ?? 0) };
  },
};
