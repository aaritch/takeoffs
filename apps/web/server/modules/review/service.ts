import type {
  CustomerRole,
  FeedbackAction,
  MeasurementGeometry,
  MeasurementView,
} from '@takeoff/contracts';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditionsRepo } from '../conditions/repository';
import { sheetsRepo } from '../ingestion';
import {
  computeRawValue,
  isGeometryAllowedForType,
  measurementToView,
  measurementsRepo,
  recomputeRollup,
  type Measurement,
} from '../measurements';
import { NotFound, ValidationFailed } from '../source-files/errors';
import { detectionFeedbackRepo } from './repository';

/**
 * Candidate review actions (P2-10) with feedback capture (P2-11 GATE). Every action is
 * server-authoritative — the rollup is recomputed from the authoritative measurement set, never
 * trusted from the client — and EVERY action writes exactly one DetectionFeedback row with full
 * provenance (action, before/after geometry, from/to class, originating model run, actor + role).
 * Capture is treated as a first-class requirement: it happens in the same transaction as the state
 * change, so a review action and its training signal commit together or not at all.
 */

export interface Actor {
  userId: string;
  role: CustomerRole;
}

async function writeFeedback(
  tx: OrgScopedTx,
  m: Measurement,
  action: FeedbackAction,
  actor: Actor,
  extra: {
    before?: MeasurementGeometry;
    after?: MeasurementGeometry;
    fromClass?: string | null;
    toClass?: string | null;
  } = {},
): Promise<void> {
  await detectionFeedbackRepo.insert(tx, {
    org_id: m.org_id,
    measurement_id: m.id,
    model_run_id: m.model_run_id ?? null,
    action,
    before_geometry: extra.before ?? null,
    after_geometry: extra.after ?? null,
    from_class: extra.fromClass ?? null,
    to_class: extra.toClass ?? null,
    actor_user_id: actor.userId,
    actor_role: actor.role,
  });
}

async function load(tx: OrgScopedTx, id: string): Promise<Measurement> {
  const m = await measurementsRepo.getById(tx, id);
  if (!m) throw NotFound('Measurement not found');
  return m;
}

async function sheetScale(tx: OrgScopedTx, sheetId: string | null): Promise<number> {
  if (!sheetId) return 0;
  const sheet = await sheetsRepo.getById(tx, sheetId);
  return sheet?.unit_per_pixel ?? 0;
}

export const reviewService = {
  /** Accept a candidate → ACCEPTED (now counts toward the rollup). */
  async accept(tx: OrgScopedTx, id: string, actor: Actor): Promise<MeasurementView> {
    const m = await load(tx, id);
    const updated = (await measurementsRepo.update(tx, id, { review_status: 'ACCEPTED' }))!;
    await recomputeRollup(tx, m.condition_id);
    await writeFeedback(tx, m, 'ACCEPT', actor);
    return measurementToView(updated);
  },

  /** Reject a candidate → REJECTED (excluded from the rollup). */
  async reject(tx: OrgScopedTx, id: string, actor: Actor): Promise<MeasurementView> {
    const m = await load(tx, id);
    const updated = (await measurementsRepo.update(tx, id, { review_status: 'REJECTED' }))!;
    await recomputeRollup(tx, m.condition_id);
    await writeFeedback(tx, m, 'REJECT', actor);
    return measurementToView(updated);
  },

  /** Edit a candidate's geometry → AI_EDITED/EDITED, recomputing its quantity from the sheet scale. */
  async editGeometry(
    tx: OrgScopedTx,
    id: string,
    geometry: MeasurementGeometry,
    actor: Actor,
  ): Promise<MeasurementView> {
    const m = await load(tx, id);
    const before = m.geometry;
    const rawValue = computeRawValue(geometry, await sheetScale(tx, m.sheet_id));
    const updated = (await measurementsRepo.update(tx, id, {
      geom_type: geometry.type,
      geometry,
      raw_value: rawValue,
      source: 'AI_EDITED',
      review_status: 'EDITED',
    }))!;
    await recomputeRollup(tx, m.condition_id);
    await writeFeedback(tx, m, 'EDIT_GEOMETRY', actor, { before, after: geometry });
    return measurementToView(updated);
  },

  /** Move a candidate to a different condition → AI_EDITED/EDITED; recomputes both rollups. */
  async reclassify(
    tx: OrgScopedTx,
    id: string,
    targetConditionId: string,
    actor: Actor,
  ): Promise<MeasurementView> {
    const m = await load(tx, id);
    if (targetConditionId === m.condition_id) {
      throw ValidationFailed('Measurement is already in that condition', { field: 'conditionId' });
    }
    const from = await conditionsRepo.getById(tx, m.condition_id);
    const to = await conditionsRepo.getById(tx, targetConditionId);
    if (!to) throw NotFound('Target condition not found');
    if (!isGeometryAllowedForType(to.measurement_type, m.geom_type)) {
      throw ValidationFailed(
        `Geometry ${m.geom_type} is not valid for a ${to.measurement_type} condition`,
        { field: 'conditionId' },
      );
    }
    const updated = (await measurementsRepo.update(tx, id, {
      condition_id: targetConditionId,
      source: 'AI_EDITED',
      review_status: 'EDITED',
    }))!;
    await recomputeRollup(tx, m.condition_id); // old condition loses it
    await recomputeRollup(tx, targetConditionId); // new condition gains it
    await writeFeedback(tx, m, 'RECLASSIFY', actor, {
      fromClass: from?.ai_object_class ?? from?.name ?? null,
      toClass: to.ai_object_class ?? to.name,
    });
    return measurementToView(updated);
  },

  /** Add a measurement the AI missed → a MANUAL/ACCEPTED row + an ADD_MISSED coverage signal. */
  async addMissed(
    tx: OrgScopedTx,
    input: { conditionId: string; sheetId: string; geometry: MeasurementGeometry },
    actor: Actor,
  ): Promise<MeasurementView> {
    const condition = await conditionsRepo.getById(tx, input.conditionId);
    if (!condition) throw NotFound('Condition not found');
    if (!isGeometryAllowedForType(condition.measurement_type, input.geometry.type)) {
      throw ValidationFailed(
        `Geometry ${input.geometry.type} is not valid for a ${condition.measurement_type} condition`,
        { field: 'geometry' },
      );
    }
    const rawValue = computeRawValue(input.geometry, await sheetScale(tx, input.sheetId));
    const created = await measurementsRepo.insert(tx, {
      org_id: condition.org_id,
      condition_id: input.conditionId,
      sheet_id: input.sheetId,
      geom_type: input.geometry.type,
      geometry: input.geometry,
      raw_value: rawValue,
      source: 'MANUAL',
      review_status: 'ACCEPTED',
      created_by_user_id: actor.userId,
    });
    await recomputeRollup(tx, input.conditionId);
    await writeFeedback(tx, created, 'ADD_MISSED', actor, { after: input.geometry });
    return measurementToView(created);
  },

  /**
   * Bulk-accept the UNREVIEWED AI candidates in a condition at or above a confidence, leaving the
   * rest unreviewed. Writes one ACCEPT feedback per promoted candidate. Returns the count promoted.
   */
  async bulkAcceptByConfidence(
    tx: OrgScopedTx,
    conditionId: string,
    minConfidence: number,
    actor: Actor,
  ): Promise<number> {
    const candidates = await measurementsRepo.listUnreviewedAiByCondition(
      tx,
      conditionId,
      minConfidence,
    );
    for (const m of candidates) {
      await measurementsRepo.update(tx, m.id, { review_status: 'ACCEPTED' });
      await writeFeedback(tx, m, 'ACCEPT', actor);
    }
    if (candidates.length > 0) await recomputeRollup(tx, conditionId);
    return candidates.length;
  },
};
