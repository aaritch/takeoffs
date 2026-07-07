import type { DB } from '../../data/client';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { modelVersionsRepo, type ModelVersion } from './repository';
import { nonRegresses, type NonRegressionResult } from './non-regression';

export interface RegisterCandidateInput {
  modelFamily: string;
  version: string;
  metrics: Record<string, number>;
  benchmarkId?: string | undefined;
  notes?: string | undefined;
}

/**
 * Model registry service (P4-06). Owns the promote/rollback lifecycle behind the benchmark
 * non-regression gate. Platform-global — runs on the admin connection (`DB`), no org scope. Every
 * state transition happens in one transaction so the "one ACTIVE per family" invariant can never be
 * momentarily violated (also enforced by a partial-unique index as a backstop).
 *
 * Promotion is a version flag flip, and rollback restores the version this one superseded — neither
 * is a redeploy, so the inference plane switches served weights by re-reading the ACTIVE row.
 */
export const modelRegistryService = {
  /** Register an evaluated candidate (status CANDIDATE). Rejects a duplicate (family, version). */
  async registerCandidate(db: DB, input: RegisterCandidateInput): Promise<ModelVersion> {
    return db.transaction(async (tx) => {
      const existing = await modelVersionsRepo.getByFamilyVersion(
        tx,
        input.modelFamily,
        input.version,
      );
      if (existing) {
        throw ValidationFailed(`Version ${input.version} already exists for ${input.modelFamily}`, {
          field: 'version',
        });
      }
      return modelVersionsRepo.insert(tx, {
        model_family: input.modelFamily,
        version: input.version,
        status: 'CANDIDATE',
        metrics: input.metrics,
        benchmark_id: input.benchmarkId ?? null,
        notes: input.notes ?? null,
      });
    });
  },

  /**
   * Promote a CANDIDATE to ACTIVE, gated on non-regression against the current ACTIVE version's
   * benchmark metrics. Blocks (throws VALIDATION_FAILED) if any tracked metric regresses. On success:
   * the candidate becomes ACTIVE (records `previous_active_id` + `activated_at`), and the prior ACTIVE
   * is RETIRED. The first version for a family (no incumbent) promotes unconditionally.
   */
  async promote(
    db: DB,
    modelFamily: string,
    version: string,
    tolerance = 0,
  ): Promise<ModelVersion> {
    return db.transaction(async (tx) => {
      const candidate = await modelVersionsRepo.getByFamilyVersion(tx, modelFamily, version);
      if (!candidate) throw NotFound(`No version ${version} for ${modelFamily}`);
      if (candidate.status === 'ACTIVE') return candidate;
      if (candidate.status !== 'CANDIDATE') {
        throw ValidationFailed(
          `Only CANDIDATE versions can be promoted (version is ${candidate.status})`,
          { field: 'version' },
        );
      }

      const incumbent = await modelVersionsRepo.getActive(tx, modelFamily);
      if (incumbent) {
        const check: NonRegressionResult = nonRegresses(
          candidate.metrics,
          incumbent.metrics,
          tolerance,
        );
        if (!check.ok) {
          const detail = check.regressions
            .map((r) => `${r.metric}: ${r.candidate ?? 'missing'} < ${r.active}`)
            .join('; ');
          throw ValidationFailed(`Promotion blocked — benchmark regression on ${detail}`, {
            field: 'metrics',
          });
        }
        await modelVersionsRepo.update(tx, incumbent.id, { status: 'RETIRED' });
      }

      return modelVersionsRepo.update(tx, candidate.id, {
        status: 'ACTIVE',
        previous_active_id: incumbent?.id ?? null,
        activated_at: new Date(),
      });
    });
  },

  /**
   * Roll back the current ACTIVE version for a family: switch serving back to the version it
   * superseded (`previous_active_id`). The rolled-back version becomes ROLLED_BACK; the restored one
   * becomes ACTIVE again. Immediate — a version switch, not a redeploy. Throws if there is nothing
   * active, or the active version has no predecessor to restore.
   */
  async rollback(db: DB, modelFamily: string): Promise<ModelVersion> {
    return db.transaction(async (tx) => {
      const active = await modelVersionsRepo.getActive(tx, modelFamily);
      if (!active) throw NotFound(`No active version for ${modelFamily}`);
      if (!active.previous_active_id) {
        throw ValidationFailed(
          `Cannot roll back ${modelFamily} — the active version has no predecessor`,
          { field: 'modelFamily' },
        );
      }
      const predecessor = await modelVersionsRepo.getById(tx, active.previous_active_id);
      if (!predecessor) {
        throw ValidationFailed(`Predecessor version for ${modelFamily} is missing`, {
          field: 'modelFamily',
        });
      }
      await modelVersionsRepo.update(tx, active.id, { status: 'ROLLED_BACK' });
      return modelVersionsRepo.update(tx, predecessor.id, {
        status: 'ACTIVE',
        activated_at: new Date(),
      });
    });
  },

  activeVersion(db: DB, modelFamily: string): Promise<ModelVersion | undefined> {
    return db.transaction((tx) => modelVersionsRepo.getActive(tx, modelFamily));
  },

  /**
   * The serving version map (`{ family: version }`) stamped onto every ModelRun (P2-03 / P4-06 test 3),
   * so each run records exactly which model versions produced it — the audit trail a rollback relies on.
   */
  async activeServingVersions(db: DB): Promise<Record<string, string>> {
    const rows = await db.transaction((tx) => modelVersionsRepo.listActive(tx));
    const map: Record<string, string> = {};
    for (const row of rows) map[row.model_family] = row.version;
    return map;
  },

  listByFamily(db: DB, modelFamily: string): Promise<ModelVersion[]> {
    return db.transaction((tx) => modelVersionsRepo.listByFamily(tx, modelFamily));
  },

  listRecent(db: DB): Promise<ModelVersion[]> {
    return db.transaction((tx) => modelVersionsRepo.listRecent(tx));
  },
};
