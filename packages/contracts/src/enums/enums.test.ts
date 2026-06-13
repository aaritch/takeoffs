import { describe, it, expect } from 'vitest';
import { z } from 'zod';
// Import from the package's public surface — the same entrypoint the API/client use —
// to prove every enum resolves from @takeoff/contracts (no local re-declaration).
import * as contracts from '../index';
import {
  CustomerRole,
  ServiceRole,
  MeasurementType,
  IngestStatus,
  OrderStatus,
  Unit,
  UNIT_DIMENSION,
  CUSTOMER_ROLE_RANK,
  ORDER_STATUS_TRANSITIONS,
} from '../index';

/** Every Zod enum exported from the public surface. */
const exportedEnums = Object.entries(contracts).filter(
  ([, value]) => value instanceof z.ZodEnum,
) as unknown as [string, z.ZodEnum<[string, ...string[]]>][];

describe('contracts enums (public surface)', () => {
  it('exports a broad set of enums from the package root', () => {
    // Guards against an enum being defined but never re-exported.
    expect(exportedEnums.length).toBeGreaterThanOrEqual(25);
  });

  it('uses UPPER_SNAKE_CASE for every value of every enum', () => {
    const upperSnake = /^[A-Z][A-Z0-9_]*$/;
    for (const [name, schema] of exportedEnums) {
      for (const value of schema.options) {
        expect(value, `${name} value "${value}"`).toMatch(upperSnake);
      }
    }
  });

  it('rejects unknown values at the boundary', () => {
    expect(CustomerRole.safeParse('SUPERUSER').success).toBe(false);
    expect(ServiceRole.safeParse('OWNER').success).toBe(false); // customer role, not a service role
    expect(MeasurementType.safeParse('linear').success).toBe(false); // case-sensitive
  });

  it('matches the spec value sets exactly (spot checks)', () => {
    expect(CustomerRole.options).toEqual(['OWNER', 'ADMIN', 'ESTIMATOR_MEMBER', 'VIEWER']);
    expect(MeasurementType.options).toEqual(['LINEAR', 'AREA', 'COUNT', 'VOLUME', 'SURFACE_AREA']);
    expect(IngestStatus.options).toContain('RASTERIZING');
    expect(IngestStatus.options.at(-1)).toBe('FAILED');
  });
});

describe('derived maps stay in sync with their enums', () => {
  it('CUSTOMER_ROLE_RANK covers every customer role', () => {
    expect(Object.keys(CUSTOMER_ROLE_RANK).sort()).toEqual([...CustomerRole.options].sort());
  });

  it('UNIT_DIMENSION covers every unit', () => {
    expect(Object.keys(UNIT_DIMENSION).sort()).toEqual([...Unit.options].sort());
  });
});

describe('OrderStatus state machine', () => {
  it('defines transitions for every status, targeting only valid statuses', () => {
    const valid = new Set<string>(OrderStatus.options);
    expect(Object.keys(ORDER_STATUS_TRANSITIONS).sort()).toEqual([...OrderStatus.options].sort());
    for (const targets of Object.values(ORDER_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(valid.has(target)).toBe(true);
      }
    }
  });

  it('treats ACCEPTED and CANCELLED as terminal and allows the dispute edge', () => {
    expect(ORDER_STATUS_TRANSITIONS.ACCEPTED).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.DELIVERED).toContain('DISPUTED');
    expect(ORDER_STATUS_TRANSITIONS.IN_QA).toContain('REVISIONS');
  });
});
