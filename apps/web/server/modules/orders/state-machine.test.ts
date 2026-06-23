import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
  type OrderStatus as Status,
} from '@takeoff/contracts';
import { OrderError } from './errors';
import { assertTransition, canTransition, isTerminal, legalTransitions } from './state-machine';

const ALL = OrderStatus.options;

describe('order state machine (P3-01)', () => {
  it('canTransition agrees with the canonical transition table for every status pair', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to)).toBe(ORDER_STATUS_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('assertTransition passes a legal move and throws ILLEGAL_TRANSITION on an illegal one', () => {
    expect(() => assertTransition('DRAFT', 'QUOTED')).not.toThrow();
    let thrown: unknown;
    try {
      assertTransition('DRAFT', 'DELIVERED');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OrderError);
    expect((thrown as OrderError).code).toBe('ILLEGAL_TRANSITION');
  });

  it('ACCEPTED and CANCELLED are terminal; every other status has outgoing transitions', () => {
    for (const s of ALL) {
      expect(isTerminal(s)).toBe(s === 'ACCEPTED' || s === 'CANCELLED');
    }
  });

  it('the happy path DRAFT → … → ACCEPTED is fully legal', () => {
    const path: Status[] = [
      'DRAFT',
      'QUOTED',
      'PLACED',
      'ASSIGNED',
      'IN_PROGRESS',
      'IN_QA',
      'DELIVERED',
      'ACCEPTED',
    ];
    for (let i = 1; i < path.length; i++) {
      expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('the QA revisions loop is legal and can repeat (IN_QA → REVISIONS → IN_PROGRESS → IN_QA)', () => {
    expect(canTransition('IN_QA', 'REVISIONS')).toBe(true);
    expect(canTransition('REVISIONS', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'IN_QA')).toBe(true);
  });

  it('cancellation and dispute are legal only from valid states', () => {
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('DELIVERED', 'DISPUTED')).toBe(true);
    // Terminal states allow nothing further.
    expect(canTransition('ACCEPTED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('legalTransitions returns the canonical list for a status', () => {
    expect(legalTransitions('DELIVERED')).toEqual(ORDER_STATUS_TRANSITIONS.DELIVERED);
    expect(legalTransitions('ACCEPTED')).toEqual([]);
  });
});
