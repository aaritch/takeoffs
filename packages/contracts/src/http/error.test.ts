import { describe, it, expect } from 'vitest';
import { ErrorEnvelope } from './error';
import { PaginationQuery, pageOf } from './pagination';
import { z } from 'zod';

describe('ErrorEnvelope', () => {
  it('accepts a valid envelope (with and without details)', () => {
    expect(ErrorEnvelope.parse({ code: 'NOT_FOUND', message: 'No such project' })).toEqual({
      code: 'NOT_FOUND',
      message: 'No such project',
    });

    const withDetails = ErrorEnvelope.parse({
      code: 'VALIDATION_FAILED',
      message: 'Bad request',
      details: [{ field: 'conditions.0.unit', message: 'Unknown unit' }],
    });
    expect(withDetails.details?.[0]?.field).toBe('conditions.0.unit');
  });

  it('rejects a malformed payload and points at the precise fields', () => {
    const result = ErrorEnvelope.safeParse({ message: 123 }); // code missing, message wrong type
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('code'); // required, missing
      expect(paths).toContain('message'); // present but wrong type
    }
  });
});

describe('PaginationQuery', () => {
  it('coerces a string limit and applies the default', () => {
    expect(PaginationQuery.parse({ limit: '50' })).toEqual({ limit: 50 });
    expect(PaginationQuery.parse({})).toEqual({ limit: 20 });
  });

  it('rejects an out-of-range limit', () => {
    expect(PaginationQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(PaginationQuery.safeParse({ limit: 9999 }).success).toBe(false);
  });
});

describe('pageOf', () => {
  it('builds a page schema with items and a nullable cursor', () => {
    const StringPage = pageOf(z.string());
    expect(StringPage.parse({ items: ['a', 'b'], next_cursor: null })).toEqual({
      items: ['a', 'b'],
      next_cursor: null,
    });
    expect(StringPage.safeParse({ items: [1], next_cursor: null }).success).toBe(false);
  });
});
