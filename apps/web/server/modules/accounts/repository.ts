import { and, eq, isNull, isNotNull, count } from 'drizzle-orm';
import type { CustomerRole } from '@takeoff/contracts';
import type { DB } from '../../data/client';
import { memberships, organizations, serviceProfiles, users } from '../../data/schema';

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type ServiceProfile = typeof serviceProfiles.$inferSelect;

/** A membership is "active" when accepted and not soft-deleted. */
const activeMembership = (orgId: string, userId: string) =>
  and(
    eq(memberships.org_id, orgId),
    eq(memberships.user_id, userId),
    isNotNull(memberships.accepted_at),
    isNull(memberships.deleted_at),
  );

export const repo = {
  // --- organizations ---
  async insertOrganization(
    db: DB,
    values: typeof organizations.$inferInsert,
  ): Promise<Organization> {
    const [row] = await db.insert(organizations).values(values).returning();
    return row!;
  },

  async getOrganization(db: DB, id: string): Promise<Organization | undefined> {
    return db.query.organizations.findFirst({
      where: and(eq(organizations.id, id), isNull(organizations.deleted_at)),
    });
  },

  // --- users ---
  async insertUser(db: DB, values: typeof users.$inferInsert): Promise<User> {
    const [row] = await db.insert(users).values(values).returning();
    return row!;
  },

  async getUserByEmail(db: DB, email: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(users.email, email) });
  },

  async getUserById(db: DB, id: string): Promise<User | undefined> {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  async setUserStatus(db: DB, userId: string, status: User['status']): Promise<void> {
    await db.update(users).set({ status, updated_at: new Date() }).where(eq(users.id, userId));
  },

  /** Update identity fields on each login (provider subject, last-seen). */
  async touchUser(
    db: DB,
    userId: string,
    patch: { auth_provider_subject?: string },
  ): Promise<void> {
    await db
      .update(users)
      .set({
        ...(patch.auth_provider_subject
          ? { auth_provider_subject: patch.auth_provider_subject }
          : {}),
        last_seen_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));
  },

  // --- memberships ---
  async insertMembership(db: DB, values: typeof memberships.$inferInsert): Promise<Membership> {
    const [row] = await db.insert(memberships).values(values).returning();
    return row!;
  },

  /** Any non-deleted membership (active or pending) for this user in this org. */
  async getMembership(db: DB, orgId: string, userId: string): Promise<Membership | undefined> {
    return db.query.memberships.findFirst({
      where: and(
        eq(memberships.org_id, orgId),
        eq(memberships.user_id, userId),
        isNull(memberships.deleted_at),
      ),
    });
  },

  async getActiveMembership(
    db: DB,
    orgId: string,
    userId: string,
  ): Promise<Membership | undefined> {
    return db.query.memberships.findFirst({ where: activeMembership(orgId, userId) });
  },

  /** All active memberships for a user across orgs (used to build the AuthContext). */
  async listActiveMembershipsForUser(db: DB, userId: string): Promise<Membership[]> {
    return db.query.memberships.findMany({
      where: and(
        eq(memberships.user_id, userId),
        isNotNull(memberships.accepted_at),
        isNull(memberships.deleted_at),
      ),
    });
  },

  async countActiveMembers(db: DB, orgId: string): Promise<number> {
    const [row] = await db
      .select({ c: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.org_id, orgId),
          isNotNull(memberships.accepted_at),
          isNull(memberships.deleted_at),
        ),
      );
    return Number(row?.c ?? 0);
  },

  async countActiveOwners(db: DB, orgId: string): Promise<number> {
    const [row] = await db
      .select({ c: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.org_id, orgId),
          eq(memberships.role, 'OWNER'),
          isNotNull(memberships.accepted_at),
          isNull(memberships.deleted_at),
        ),
      );
    return Number(row?.c ?? 0);
  },

  async acceptMembership(db: DB, membershipId: string): Promise<Membership> {
    const now = new Date();
    const [row] = await db
      .update(memberships)
      .set({ accepted_at: now, updated_at: now })
      .where(eq(memberships.id, membershipId))
      .returning();
    return row!;
  },

  async updateMembershipRole(
    db: DB,
    membershipId: string,
    role: CustomerRole,
  ): Promise<Membership> {
    const [row] = await db
      .update(memberships)
      .set({ role, updated_at: new Date() })
      .where(eq(memberships.id, membershipId))
      .returning();
    return row!;
  },

  /** Soft-delete: revokes access on the next request (the resolver excludes deleted rows). */
  async softDeleteMembership(db: DB, membershipId: string): Promise<void> {
    const now = new Date();
    await db
      .update(memberships)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(memberships.id, membershipId));
  },

  // --- service profiles ---
  async getServiceProfileByUser(db: DB, userId: string): Promise<ServiceProfile | undefined> {
    return db.query.serviceProfiles.findFirst({ where: eq(serviceProfiles.user_id, userId) });
  },
};
