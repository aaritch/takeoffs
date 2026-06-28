# 0001 — Multi-region readiness & DR posture

**Status:** Accepted (P5-01)

## Context

The platform must meet RPO ≤ 5 min and RTO ≤ 1 hr (spec §15) and be "multi-region-capable" (spec §14:
multi-AZ within one region to start, designed for multi-region later). The architecture is split into
planes hosted in two homes (CLAUDE.md §5–6): the stateless app plane on Vercel, and the
processing/AI/realtime planes on a Phase-2 compute host. Customer data lives in managed stores (Neon
Postgres, Cloudflare R2 / S3), not in the app tier.

The risk this ADR addresses: backups and "multi-region" claims are worthless unless recovery is
actually exercised — "backups that are never restored are not backups."

## Decision

1. **Keep the application plane stateless.** It only enqueues work and reads managed stores, so a
   region outage is absorbed by Vercel's edge and recovery never involves restoring app state. This is
   already true and is treated as an invariant (no per-instance durable state).
2. **Make failover a configuration change, not a code change.** The DB connection is read from
   `DATABASE_URL` / `APP_DATABASE_URL`; a regional failover repoints these via IaC. Workers are
   recreated from IaC in the standby region and drain durable, idempotent queues.
3. **Rely on managed-store native DR:** Neon PITR (continuous WAL archiving) for the RPO; R2/S3 object
   versioning + multi-region durability for files/tiles/exports. Redis is ephemeral and rebuildable.
4. **Make drills first-class and automated.** A restore drill runs the full backup → loss → restore →
   integrity-verify cycle on an isolated canary, is checked against the RPO/RTO objectives in code
   (`recovery-objectives.ts`), and is recorded (`dr_drill_runs`) so the scheduled-drill requirement is
   auditable. A quarterly manual exercise does a real regional PITR failover.

We explicitly do NOT adopt active-active multi-region writes now (the spec says "design for
multi-region later"); the chosen posture is single-region multi-AZ with a rehearsed cross-region
restore path.

## Consequences

- Recovery is a runbook + IaC operation with a known, drilled RTO/RPO, not an improvisation.
- The drill bites: it fails (and would alert) when integrity breaks or an objective is missed, so a
  silently-broken backup can't masquerade as protection.
- Active-active and sub-minute cross-region failover remain future work; if the RTO target tightens,
  add a warm standby replica (the connection-string-driven failover already supports it).
- The Phase-2 compute home must be provisioned via IaC in both the primary and standby regions for the
  worker/AI planes to satisfy this posture; until it lands, only the app + data planes are covered.
