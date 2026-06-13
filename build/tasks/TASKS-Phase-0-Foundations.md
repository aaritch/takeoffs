# Phase 0 — Foundations · Task File

**Goal:** Stand up the skeleton everything else depends on: the monorepo, the contract layer, identity and access control, the org-isolation guarantee, CI/CD, observability, and seed data. Nothing here is user-visible, but every gate below is expensive to retrofit later.

**Exit criteria:** A user can log in, belong to an organization with a role, and the system provably cannot serve one org's data to another. CI deploys to staging automatically. Trade/condition seed data exists.

**Task ID scheme:** `P0-XX`. Dependencies reference other task IDs.

---

## P0-01 — Monorepo & workspace tooling

**Implementation details**

- Initialize the single repository with a workspace manager for the TypeScript/JavaScript packages and standalone dependency definitions for the Python services.
- Establish shared base configuration: TypeScript compiler settings, formatting, linting, and a task runner that can build/test packages individually and in dependency order.
- Create the top-level folders from the file tree (`apps`, `packages`, `infra`, `ml`, `docs`, `tools`) with placeholder readmes so structure is committed before code.
- Add an `.env.example` enumerating every environment variable the system will need, with descriptions and no real values.

**Test scenarios**

- A clean checkout installs and builds with a single command on a fresh machine.
- Changing a shared package triggers rebuilds of only its dependents.
- Lint and format checks fail the build on a deliberately malformed file.

**Caveats**

- Do not let services import each other's internals directly; only through published package boundaries. Enforce with lint rules now, while there is nothing to break.
- Resist adding feature folders before their phase — empty scaffolding rots.

---

## P0-02 — Contracts package skeleton

**Depends on:** P0-01

**Implementation details**

- Create the `contracts` package with folders for HTTP shapes, event payloads, job messages, and shared enums.
- Define the validation approach (a schema library that produces both runtime validation and static types) so every shape is validated at the boundary and typed in code.
- Publish a single public export surface; consumers import only from the package root.

**Test scenarios**

- A sample shape validates a correct payload and rejects a malformed one with a precise error.
- Importing the package from a second workspace package resolves types correctly.

**Caveats**

- This package must contain zero business logic and zero environment access. Treat any logic creeping in as a defect.
- Versioning discipline starts now: a change to a shared shape is a reviewed, deliberate event, not a casual edit.

---

## P0-03 — Core enumerations

**Depends on:** P0-02

**Implementation details**

- Encode all status and type enums from the spec: customer and service roles; project, plan-set, source-file, sheet, takeoff, order, and model-run statuses; measurement and unit types; notification channels.
- Each enum value is `UPPER_SNAKE_CASE` and documented with its meaning and allowed transitions where applicable.

**Test scenarios**

- Every enum used by the API and the client resolves from the contracts package (no local re-declaration anywhere — verify by search).

**Caveats**

- Status enums imply state machines (orders especially). Document legal transitions next to the enum even though enforcement lands in later phases.

---

## P0-04 — Infrastructure for the dev environment

**Depends on:** P0-01

**Implementation details**

- Define, in infrastructure-as-code, the `dev` environment: private network, managed PostgreSQL with the spatial extension enabled, object storage buckets, cache, and message broker.
- Database and broker live in private subnets; nothing is publicly reachable except the eventual load balancer and CDN.
- Parameterize everything by environment so `staging` and `production` are the same definitions with different inputs.

**Test scenarios**

- Applying the IaC from scratch produces a working environment; destroying and re-applying is clean and repeatable.
- The spatial extension is present and a spatial column type can be created.

**Caveats**

- Never create production resources by hand later; the pattern set here is the rule. Manual console changes are the most common source of environment drift.
- Confirm the database tier supports the spatial extension before committing to it.

---

## P0-05 — Identity provider & login flow

**Depends on:** P0-04

**Implementation details**

- Provision the OIDC/OAuth2 identity provider; configure email/password to start, with SSO and MFA capability reserved for later.
- Implement the full login round-trip in the web client and token verification in the API.
- Resolve the authenticated user to a `User` record on first login (just-in-time provisioning), storing the provider subject id, never a password.

**Test scenarios**

- A new user can sign up, log out, and log back in.
- An expired or tampered token is rejected by the API.
- A token for a disabled user is rejected.

**Caveats**

- The API resolves org and role per request from its own records, not from token claims that a client could influence.
- Keep credential handling entirely in the provider; the application should never see or store raw passwords.

---

## P0-06 — Accounts module: orgs, memberships, RBAC

**Depends on:** P0-05, P0-03

**Implementation details**

- Implement `Organization`, `User`, `Membership`, and `ServiceProfile` per the spec data model.
- Implement organization creation, member invitation, invitation acceptance, role assignment, and member removal.
- Implement the central permission check that every endpoint will call: it takes the actor, the action, and the target resource and returns allow/deny, with the role hierarchy (`OWNER ⊇ ADMIN ⊇ ESTIMATOR_MEMBER ⊇ VIEWER`) applied.
- Enforce seat limits at invitation-acceptance time with a clear upgrade message on overflow.

**Test scenarios**

- Each role can perform exactly the actions it should and is denied the rest (table-driven across roles and actions).
- Accepting an invitation that would exceed the seat limit is blocked.
- Removing a member revokes their access immediately on the next request.
- A `VIEWER` can read and export but cannot create or edit.

**Caveats**

- Decide the policy for the last `OWNER` (cannot be removed or demoted without promoting another) and enforce it.
- Service-side roles must not gain ambient access to customer data; they only act through explicitly assigned orders (relevant from Phase 3, but design the check to fail closed now).

---

## P0-07 — Org-isolation data-access layer · GATE

**Depends on:** P0-06

**Implementation details**

- Build the data-access layer so every query against a customer-owned table is automatically constrained to the caller's `org_id`. The org filter is injected centrally, not hand-written per query.
- A query that does not provide org context must fail closed (return nothing / error), never return cross-org rows.
- Namespace object-storage keys by org so storage isolation mirrors database isolation.

**Test scenarios**

- An attempt to read, update, or delete another org's project, plan set, sheet, takeoff, condition, measurement, report, or order fails for every entity type (explicit test per entity).
- A query written without org context is rejected rather than returning data.
- Signed storage URLs are scoped to a single object and expire.

**Caveats**

- This is the single most important security gate in the product. Treat any path that can return cross-org data as a release blocker.
- Add a test that fails if a new customer-owned table is introduced without an org filter, so future tables cannot silently bypass isolation.

---

## P0-08 — CI/CD pipeline

**Depends on:** P0-01, P0-04

**Implementation details**

- Configure the pipeline: on every change, run lint, type-check, unit tests, build container images, run integration tests against ephemeral dependencies, then deploy to `staging` automatically.
- Production deploys are gated by approval, use a rolling or blue-green strategy, and roll back by redeploying the previous image tag.
- Database migrations run as an explicit, ordered, reversible step using an expand/contract approach for breaking changes.

**Test scenarios**

- A passing change deploys to staging end to end without manual steps.
- A failing test blocks deploy.
- A migration can be applied and rolled back cleanly in staging.

**Caveats**

- Never run un-anonymized production data in lower environments.
- Order migrations relative to code so a deploy is safe at every intermediate state (add columns before writing them, remove readers before dropping columns).

---

## P0-09 — Observability skeleton

**Depends on:** P0-08

**Implementation details**

- Emit structured logs with a correlation id that originates at the client and flows through the API, the broker, and workers.
- Capture baseline metrics (request rate, latency, error rate) and stand up distributed tracing scaffolding even before there is much to trace.
- Create a minimal health dashboard and a first alert (error-rate spike).

**Test scenarios**

- A single request can be followed across services by its correlation id in logs and traces.
- A forced error increments the error metric and fires the alert in staging.

**Caveats**

- Retrofitting tracing after services multiply is painful; the correlation id contract must exist before Phase 1 work spreads across services.

---

## P0-10 — Seed trade structure & starter condition library · GATE

**Depends on:** P0-03

**Implementation details**

- With the domain estimator, define the seed `TradeCategory` structure (division codes and ordering) and a starter library of common `Condition` definitions with correct measurement types and units for the launch trades.
- Load these as global seed data that an org can copy and customize.

**Test scenarios**

- A new organization is provisioned with the seed trades and conditions available.
- Each seeded condition has a valid measurement type and unit.

**Caveats**

- Wrong units here cause wrong quantities everywhere downstream; the domain estimator must sign off, not engineering alone.
- Keep the launch trade list deliberately narrow; breadth can be added once the pipeline and tools are proven on a few trades.

---

## Phase 0 completion check

- [ ] Login, orgs, memberships, and roles work end to end
- [ ] Org isolation proven across every entity (P0-07 gate)
- [ ] CI deploys to staging automatically with reversible migrations
- [ ] Correlation id traces a request across services
- [ ] Seed trades and conditions exist and are estimator-approved (P0-10 gate)
