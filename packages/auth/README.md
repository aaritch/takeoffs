# @takeoff/auth

Authorization for the platform: the **central permission check** every endpoint calls, the
customer role hierarchy, and the action→minimum-role table. Pure logic — **no database, no
environment access**. (Token verification and just-in-time user resolution arrive with the
identity provider in P0-05.)

## What it provides

- `authorize(ctx, action, resource)` / `can(...)` — the single gate (spec §6.1, §13.2).
  Org isolation is checked **first and fails closed**: no active membership in the
  resource's org → deny, whatever the action. Then the role hierarchy is applied.
- `AuthContext` — the resolved actor: `userId`, active `membershipsByOrg` (org_id → role),
  and optional `serviceRole`. Built from durable records on the server, never from client
  claims. The accounts module (`apps/web/server`) builds it from the database.
- `hasCustomerCapability(role, action)` — pure rank check, ignoring org membership.
- `ACTION_MIN_ROLE` / `CUSTOMER_ACTIONS` — the action table.
- `roleRank` / `isAtLeast` — hierarchy helpers over `CUSTOMER_ROLE_RANK` from contracts.

## Rules encoded

`OWNER ⊇ ADMIN ⊇ ESTIMATOR_MEMBER ⊇ VIEWER`. VIEWER reads and exports but cannot create or
edit. Only OWNER/ADMIN manage members or delete projects. Only OWNER touches billing.
Service roles get **no ambient access** to customer resources — they act only through
explicitly assigned orders (Phase 3); until then a service-only actor is denied here.
