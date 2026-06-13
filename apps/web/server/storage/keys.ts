/**
 * Object-storage key namespacing (P0-07). Storage isolation mirrors database isolation: every
 * customer artifact lives under an org-namespaced prefix, so one org's keys can never collide
 * with or be guessed into another's. Signed-URL generation (scoped to a single object, expiring)
 * lands with the upload service in P1-01 and MUST build keys through these helpers.
 */
const ORG_PREFIX = 'org';

/** UUID v4/v7 shape check — keys are built from real org ids, not arbitrary strings. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(orgId: string): void {
  if (!UUID_RE.test(orgId)) {
    throw new Error(`Invalid org id for storage key: ${orgId}`);
  }
}

/** Build an org-namespaced storage key, e.g. orgStorageKey(org, 'plansets', id, 'file.pdf'). */
export function orgStorageKey(orgId: string, ...parts: string[]): string {
  assertUuid(orgId);
  if (parts.some((p) => p.includes('..') || p.startsWith('/'))) {
    throw new Error('Storage key parts may not contain ".." or leading slashes');
  }
  return [ORG_PREFIX, orgId, ...parts].join('/');
}

/** The prefix that scopes a listing/signing operation to a single org. */
export function orgStoragePrefix(orgId: string): string {
  assertUuid(orgId);
  return `${ORG_PREFIX}/${orgId}/`;
}

/** Extract the owning org id from a namespaced key, or undefined if it isn't org-namespaced. */
export function parseOrgFromKey(key: string): string | undefined {
  const [prefix, orgId] = key.split('/');
  if (prefix !== ORG_PREFIX || !orgId || !UUID_RE.test(orgId)) return undefined;
  return orgId;
}

/** Guard before signing/serving a key: throws if the key is not owned by `orgId`. */
export function assertKeyInOrg(key: string, orgId: string): void {
  if (parseOrgFromKey(key) !== orgId) {
    throw new Error('Storage key does not belong to this organization');
  }
}
