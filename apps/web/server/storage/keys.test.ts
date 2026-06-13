import { describe, it, expect } from 'vitest';
import { assertKeyInOrg, orgStorageKey, orgStoragePrefix, parseOrgFromKey } from './keys';

const ORG_A = '018f3a2b-0000-7000-8000-000000000001';
const ORG_B = '018f3a2b-0000-7000-8000-000000000002';

describe('org storage key namespacing', () => {
  it('builds an org-namespaced key', () => {
    expect(orgStorageKey(ORG_A, 'plansets', 'p1', 'file.pdf')).toBe(
      `org/${ORG_A}/plansets/p1/file.pdf`,
    );
    expect(orgStoragePrefix(ORG_A)).toBe(`org/${ORG_A}/`);
  });

  it('rejects path traversal and bad org ids', () => {
    expect(() => orgStorageKey(ORG_A, '..', 'etc')).toThrow();
    expect(() => orgStorageKey('not-a-uuid', 'x')).toThrow();
  });

  it('parses the owning org from a key', () => {
    expect(parseOrgFromKey(`org/${ORG_A}/tiles/0/0.png`)).toBe(ORG_A);
    expect(parseOrgFromKey('public/logo.png')).toBeUndefined();
  });

  it('guards a key against the wrong org', () => {
    const key = orgStorageKey(ORG_A, 'exports', 'r1.pdf');
    expect(() => assertKeyInOrg(key, ORG_A)).not.toThrow();
    expect(() => assertKeyInOrg(key, ORG_B)).toThrow();
  });
});
