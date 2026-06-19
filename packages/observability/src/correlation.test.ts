import { describe, expect, it } from 'vitest';
import { coerceCorrelationId, isValidCorrelationId, newCorrelationId } from './correlation';

describe('correlation id', () => {
  it('mints time-ordered UUID v7 ids', () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(isValidCorrelationId(a)).toBe(true);
    expect(a).not.toBe(b);
    // UUID v7: version nibble is 7
    expect(a[14]).toBe('7');
  });

  it('accepts a valid inbound id as-is', () => {
    const inbound = '0190f8e2-7a1b-7c3d-8e4f-1a2b3c4d5e6f';
    expect(coerceCorrelationId(inbound)).toBe(inbound);
  });

  it('replaces missing, empty, or malformed ids with a fresh one', () => {
    for (const bad of [
      null,
      undefined,
      '',
      '   ',
      'has spaces',
      'short',
      'a'.repeat(201),
      '"; DROP TABLE',
    ]) {
      const out = coerceCorrelationId(bad as string | null | undefined);
      expect(isValidCorrelationId(out)).toBe(true);
      expect(out).not.toBe(bad);
    }
  });
});
