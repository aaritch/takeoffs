# Disaster recovery & multi-region readiness (P5-01)

> **Backups that are never restored are not backups.** Restore drills are mandatory, not optional.
> The automated drill (below) proves the restore _mechanism_ on every run; a full DR exercise (a real
> regional failover) is run on the schedule in §5.

## 1. Recovery objectives (spec §15)

| Objective                     | Target          | How it's met                                                                                   |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| **RPO** (max data loss)       | **≤ 5 minutes** | Continuous transaction-log archiving (Neon point-in-time recovery) + object-storage versioning |
| **RTO** (max time to recover) | **≤ 1 hour**    | PITR restore + redeploy from IaC + object-storage already durable cross-AZ                     |
| Uptime                        | 99.9%           | Multi-AZ managed stores; stateless app plane on Vercel's edge                                  |

These targets are encoded in `apps/web/server/modules/dr/recovery-objectives.ts`
(`RPO_TARGET_SECONDS` / `RTO_TARGET_SECONDS`) and every drill is checked against them.

## 2. What is backed up, and where

| Data                                          | Store                  | Backup mechanism                                      | Recovery                                                               |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Relational data (the source of truth)         | **Neon Postgres**      | Daily snapshots **+ continuous WAL archiving** (PITR) | Restore a branch to a timestamp within the RPO window                  |
| Source files, tiles, exports, model artifacts | **Cloudflare R2 / S3** | **Object versioning** + lifecycle policy              | Roll an object back to a prior version; bucket is multi-region durable |
| Cache / job state                             | **Upstash Redis**      | Ephemeral by design (rebuildable)                     | Not restored — jobs are idempotent and re-enqueued                     |

Customer-facing invariant: nothing that is the _source of truth_ lives only in the cache. Quantities,
geometry, orders, billing state, and audit logs are all in Postgres (PITR) or object storage
(versioned).

## 3. Multi-region readiness

The system is split into planes (CLAUDE.md §5), each with a distinct DR posture:

- **Application plane (Vercel, stateless):** already multi-region at the edge; a region outage is
  absorbed by Vercel. No customer data lives here — it only enqueues work and reads managed stores.
- **Data (Neon Postgres):** multi-AZ within a region to start (spec §14: "design for multi-region
  later"). Cross-region is achieved by PITR-restoring into a standby region; read replicas can front
  read-heavy reporting. The app reads `DATABASE_URL`/`APP_DATABASE_URL`, so a failover is a connection
  string change applied through IaC, not a code change.
- **Object storage (R2/S3):** multi-region durable; versioned. No failover step needed beyond
  repointing the bucket if the provider region changes.
- **Processing / AI / realtime plane (Phase-2 compute home, TBD):** stateless workers that drain
  durable queues — recreated from IaC in the standby region; no state to recover.

See ADR `docs/adr/0001-multi-region-readiness.md` for the decision and its consequences.

## 4. Recovery procedure (region or database loss)

1. **Declare** the incident; freeze writes if the primary is partially up.
2. **Restore the database** to a point in time within the RPO window (Neon branch → timestamp).
   Verify the latest committed `AuditLog` / `order_events` rows are present and consistent.
3. **Repoint** `DATABASE_URL` / `APP_DATABASE_URL` (and the worker host's vars) to the restored
   instance via IaC; redeploy is a no-op for the stateless app (Vercel) and a recreate for workers.
4. **Object storage** needs no restore unless a specific object was corrupted (roll back its version).
5. **Drain** the queues — idempotent jobs reprocess any work in flight; no manual replay.
6. **Verify** with the automated drill (§5) against the recovered stores, then unfreeze.

Target: complete within the **1-hour RTO**, with data loss within the **5-minute RPO**.

## 5. Drills — automated + scheduled

- **Automated restore drill** (`POST /v1/ops/dr/drills`, PLATFORM_ADMIN): performs a real
  backup → simulated-loss → restore → integrity-verify cycle on an isolated temp canary (it never
  touches customer data) and records the outcome (`GET /v1/ops/dr/drills`). It proves the restore
  mechanism + checks RPO/RTO on every run. **Schedule:** run on a cron (e.g. daily); alert if a run
  is `FAILED` or if no successful run has occurred within the SLA window.
- **Full DR exercise** (manual, **quarterly**): execute §4 end to end against a standby region using a
  real PITR restore, timing the actual RTO and measuring the actual RPO. Record the result alongside
  the automated runs. A backup is only trusted once it has been restored in a drill.
