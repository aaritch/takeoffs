# Security review (P5-06)

An internal review of the security baseline (spec §13–14, CLAUDE.md §10) ahead of the external
penetration test. It inventories the controls in the four focus areas a pen test targets — **tenant
isolation, auth, payments, file handling** — and points at the automated evidence that each holds.
The adversarial regression suite is `apps/web/server/security/security-review.test.ts`.

> Scope note (the caveat): this review is run **after Phase 3**, when the managed-service marketplace
> widened the attack surface (cross-actor access, payouts, customer-supplied files).

## 1. Tenant isolation

| Control                                                          | Where enforced                                                                                                                      | Evidence                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org isolation fails closed at the data layer (RLS)               | Postgres RLS on every `org_id` table; the non-superuser `takeoff_app` role is RLS-subject; `withOrgScope` sets `app.current_org_id` | `org-isolation.test.ts` (RLS enabled+forced+policy on **every** org table — build fails otherwise); `*-isolation.test.ts`; security suite (cross-org read/list/no-scope all return nothing) |
| Two DB roles                                                     | admin (`DATABASE_URL`, RLS-bypassing platform ops) vs `takeoff_app` (`APP_DATABASE_URL`, RLS-subject customer ops)                  | `verify-app-role`; bootstrap creates `takeoff_app` NOSUPERUSER/NOBYPASSRLS                                                                                                                  |
| Object-storage keys namespaced by org                            | `orgStorageKey(orgId, …)`; `assertKeyInOrg` guards before signing/serving                                                           | security suite (cross-org key rejected; traversal rejected)                                                                                                                                 |
| Platform-global tables carry no `org_id` (not customer-readable) | `billing_events`, `pricing_rules`, `payout_records`, `dr_drill_runs`                                                                | exempt from the org-RLS guard by design; reached only via platform routes                                                                                                                   |

## 2. Authentication & authorization

| Control                                                                | Where enforced                                                                                               | Evidence                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Every `/v1` request is authenticated + org/role-authorized server-side | `apiHandler` (session → org membership → role) / `platformHandler` (session → active service profile → role) | route handlers; `platform-auth.test.ts`                                                                          |
| Roles come from durable records, never token claims                    | `resolveAuthContext` (memberships), `resolvePlatformActor` (active `ServiceProfile`)                         | revoking a membership/profile denies on the next call; security suite (deny without active profile / wrong role) |
| Capability checks for privileged actions                               | `requireCapability` (members:manage, etc.); OWNER/ADMIN gates on billing/webhooks/SSO routes                 | `accounts.test.ts`; security suite (a VIEWER cannot manage members)                                              |
| Estimator isolation (cross-actor)                                      | `assertEstimatorCanAccessOrder` — an estimator may touch only orders assigned to them                        | `assignment.test.ts`                                                                                             |
| Append-only audit/ledger immutability                                  | DB triggers reject UPDATE/DELETE on `order_events`, `retainer_ledger_entries`                                | `audit.test.ts`, `retainer.test.ts`                                                                              |

## 3. Payments (money in / money out)

| Control                                                                   | Where enforced                                                                                                                   | Evidence                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| No fulfillment of unpaid orders                                           | `ordersService.place` secures payment (charge/retainer draw) before `QUOTED → PLACED`; failure leaves the order out of the queue | `placement.test.ts`         |
| Retainer integrity                                                        | append-only ledger; balance only ever changes alongside a ledger entry, in one tx; reconciles to the ledger                      | `retainer.test.ts`          |
| Payouts only on acceptance/auto-accept; never a disputed/unaccepted order | `payoutService.processAcceptedOrder` gate; reversal preserves the audit trail                                                    | `payouts.test.ts` (GATE)    |
| Money as integer minor units; webhook source of truth                     | `*_minor` columns; provider webhooks reconciled idempotently + order-safe                                                        | `webhook.test.ts` (billing) |
| Transfers initiated server-side only                                      | payout/webhook senders are server seams; routes are platform-gated                                                               | route review                |

## 4. File handling (untrusted input)

| Control                                                             | Where enforced                                                                                 | Evidence                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Type allow-list + size limits on every ingress                      | `validateUploadRequest` / `isAllowedType` for uploads AND cloud imports                        | `validation.test.ts`, `cloud-import.test.ts` |
| Malware scan + verification run in ingestion, regardless of ingress | the ingestion pipeline scans; cloud import lands at the same UPLOADED + enqueue point          | `ingestion.test.ts`, `cloud-import.test.ts`  |
| External sources are not trusted                                    | imported files get identical validation + scan; permission/fetch failures leave no half-import | `cloud-import.test.ts`                       |
| Derived artifacts never execute; safe object keys                   | tiles/exports are data; keys are `id`-based, traversal-rejected                                | `orgStorageKey`                              |
| Signed, expiring, org-guarded download URLs                         | `assertKeyInOrg` before signing; short TTL                                                     | reports/tiles delivery                       |

## 5. Cross-cutting

- Parameterized queries only (Drizzle / `sql` templates) — injection payloads are stored as data
  (security suite); no string-concatenated SQL.
- Input validated + output encoded at every boundary (Zod request schemas; CSV/JSON renderers escape).
- Secrets in env/managed store, never in code or images; webhook/SSO secrets returned once, never
  re-serialized.
- Per-request correlation id + structured logs; append-only audit for security-relevant actions.

## Outcome

No open findings from the internal review; all baseline controls have automated evidence. The
external pen test (see `pentest-plan.md`) is the independent validation, with findings tracked there.
