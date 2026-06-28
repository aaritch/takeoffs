import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../data/client';
import { retainerLedgerEntries } from '../../data/schema';
import { accountsService } from '../accounts';
import { retainerService } from './index';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://takeoff:takeoff@localhost:5432/takeoff';
const migrationsFolder = fileURLToPath(new URL('../../data/migrations', import.meta.url));

let admin: DbHandle;

beforeAll(async () => {
  admin = createDb(adminUrl);
  await migrate(admin.db, { migrationsFolder });
});

beforeEach(async () => {
  await admin.db.execute(
    sql`TRUNCATE retainer_ledger_entries, retainers, memberships, organizations, users RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await admin.pool.end();
});

async function org(slug: string): Promise<string> {
  const { organization } = await accountsService.createOrganizationWithOwner(admin.db, {
    name: slug,
    slug,
    owner: { email: `${slug}@t.test` },
  });
  return organization.id;
}

const topUp = (orgId: string, amount: number, ref?: string) =>
  admin.db.transaction((tx) =>
    retainerService.topUp(tx, orgId, amount, ref ? { paymentReference: ref } : {}),
  );
const draw = (orgId: string, amount: number, orderId?: string) =>
  admin.db.transaction((tx) => retainerService.draw(tx, orgId, amount, orderId ? { orderId } : {}));
const ledger = (orgId: string) => admin.db.transaction((tx) => retainerService.ledger(tx, orgId));
const balanceOf = (orgId: string) =>
  admin.db.transaction((tx) => retainerService.getByOrg(tx, orgId)).then((r) => r?.balance_minor);

describe('retainers & draw-down (P4-03)', () => {
  it('a top-up credits the balance and writes a TOP_UP ledger entry', async () => {
    const orgId = await org('topup');
    const { retainer, entry } = await topUp(orgId, 50_000, 'pi_123');

    expect(retainer.balance_minor).toBe(50_000);
    expect(entry).toMatchObject({
      entry_type: 'TOP_UP',
      amount_minor: 50_000,
      balance_after_minor: 50_000,
      reference_type: 'PAYMENT',
      reference_id: 'pi_123',
    });
  });

  it('a draw debits the balance and writes a signed DRAW entry referencing the order', async () => {
    const orgId = await org('draw');
    await topUp(orgId, 50_000);
    const newBalance = await draw(orgId, 30_000, 'order-abc');

    expect(newBalance).toBe(20_000);
    expect(await balanceOf(orgId)).toBe(20_000);
    const entries = await ledger(orgId);
    expect(entries[0]).toMatchObject({
      entry_type: 'DRAW',
      amount_minor: -30_000, // signed: a debit
      balance_after_minor: 20_000,
      reference_type: 'ORDER',
      reference_id: 'order-abc',
    });
  });

  it('an insufficient draw makes no change and writes no entry', async () => {
    const orgId = await org('short');
    await topUp(orgId, 100);
    const result = await draw(orgId, 500);

    expect(result).toBeNull();
    expect(await balanceOf(orgId)).toBe(100); // untouched
    const entries = await ledger(orgId);
    expect(entries).toHaveLength(1); // only the top-up; no DRAW entry
    expect(entries[0]!.entry_type).toBe('TOP_UP');
  });

  it('a draw with no retainer at all is refused (insufficient), no rows created', async () => {
    const orgId = await org('none');
    expect(await draw(orgId, 100)).toBeNull();
    expect(await balanceOf(orgId)).toBeUndefined();
    expect(await ledger(orgId)).toHaveLength(0);
  });

  it('the ledger reconciles to the balance at all times', async () => {
    const orgId = await org('recon');
    await topUp(orgId, 100_000);
    await draw(orgId, 25_000, 'o1');
    await topUp(orgId, 10_000);
    await draw(orgId, 40_000, 'o2');

    const expected = 100_000 - 25_000 + 10_000 - 40_000; // 45_000
    const fromLedger = await admin.db.transaction((tx) =>
      retainerService.balanceFromLedger(tx, orgId),
    );
    expect(fromLedger).toBe(expected);
    expect(await balanceOf(orgId)).toBe(expected);
    const entries = await ledger(orgId);
    expect(entries[0]!.balance_after_minor).toBe(expected); // newest entry's running balance
  });

  it('rejects a non-positive top-up', async () => {
    const orgId = await org('bad');
    await expect(topUp(orgId, 0)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(topUp(orgId, -100)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('ledger entries are immutable — UPDATE and DELETE are rejected', async () => {
    const orgId = await org('immutable');
    const { entry } = await topUp(orgId, 1_000);

    await expect(
      admin.db
        .update(retainerLedgerEntries)
        .set({ amount_minor: 999_999 })
        .where(eq(retainerLedgerEntries.id, entry.id)),
    ).rejects.toThrow(/append-only/);
    await expect(
      admin.db.delete(retainerLedgerEntries).where(eq(retainerLedgerEntries.id, entry.id)),
    ).rejects.toThrow(/append-only/);
  });
});
