import type { DB } from '../../data/client';
import type { OrgScopedTx } from '../../data/org-scope';
import { conditionsRepo } from '../conditions/repository';
import { sheetsRepo } from '../ingestion';
import { NotFound, ValidationFailed } from '../orders/errors';
import { ordersRepo, type Order } from '../orders/repository';
import { ordersService, type Actor } from '../orders';
import { assignmentService } from './assignment';

/**
 * QA workflow (P3-06 · GATE). When the estimator completes work the order moves to IN_QA, and a
 * SERVICE_QA reviewer works a checklist before it can be DELIVERED — orders never bypass QA (the
 * caveat; the state machine already forbids any other path to DELIVERED). Two checklist items are
 * AUTO-verified and block approval (scale confirmed on every sheet; all requested trades covered);
 * two are reviewer attestations (quantities spot-checked; report renders). The checklist + notes are
 * recorded on the order's immutable audit log, so the revisions loop preserves prior context.
 *
 * NOTE: the exact checklist contents/thresholds are the domain estimator's to own (STATE §7 TBD);
 * this is the mechanism + a sensible default set.
 */

export interface QaChecklist {
  /** Every sheet in the plan set has a CONFIRMED scale (and there is at least one sheet). */
  scaleConfirmed: boolean;
  /** Labels of sheets whose scale is not confirmed (the blockers). */
  unconfirmedSheets: string[];
  /** The takeoff's conditions cover every requested trade. */
  tradesCovered: boolean;
  /** Requested trade-category ids not yet covered by any condition. */
  missingTrades: string[];
}

export interface QaAttestation {
  quantitiesSpotChecked: boolean;
  reportRenders: boolean;
}

async function computeChecklist(tx: OrgScopedTx, order: Order): Promise<QaChecklist> {
  const sheets = order.plan_set_id ? await sheetsRepo.listByPlanSet(tx, order.plan_set_id) : [];
  const unconfirmed = sheets.filter((s) => s.scale_status !== 'CONFIRMED');

  const conditions = order.delivered_takeoff_id
    ? await conditionsRepo.listByTakeoff(tx, order.delivered_takeoff_id)
    : [];
  const covered = new Set(conditions.map((c) => c.trade_category_id));
  const missingTrades = order.requested_trades.filter((t) => !covered.has(t));

  return {
    scaleConfirmed: sheets.length > 0 && unconfirmed.length === 0,
    unconfirmedSheets: unconfirmed.map((s) => s.sheet_number ?? `Sheet ${s.index_in_set + 1}`),
    tradesCovered: missingTrades.length === 0,
    missingTrades,
  };
}

export const qaService = {
  /** Estimator submits completed work for review: IN_PROGRESS → IN_QA (gated to the assignee). */
  async submitForQa(
    db: DB,
    orderId: string,
    estimatorProfileId: string,
    actor: Actor,
  ): Promise<Order> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      assignmentService.assertEstimatorCanAccessOrder(order, estimatorProfileId);
      return ordersService.transition(tx, orderId, 'IN_QA', actor);
    });
  },

  /** The auto-computed checklist a reviewer sees for an order. */
  async checklist(db: DB, orderId: string): Promise<QaChecklist> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      return computeChecklist(tx, order);
    });
  },

  /**
   * QA approval → DELIVERED. Blocked unless every checklist item passes — the auto-checks AND the
   * reviewer's attestations. The full checklist is recorded on the audit log.
   */
  async approve(
    db: DB,
    orderId: string,
    qaProfileId: string,
    actor: Actor,
    attest: QaAttestation,
  ): Promise<Order> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      const checklist = await computeChecklist(tx, order);
      if (!checklist.scaleConfirmed || !checklist.tradesCovered) {
        throw ValidationFailed('QA checklist not satisfied — return to the estimator', 'checklist');
      }
      if (!attest.quantitiesSpotChecked || !attest.reportRenders) {
        throw ValidationFailed('QA attestations incomplete', 'checklist');
      }
      return ordersService.transition(tx, orderId, 'DELIVERED', actor, {
        set: { qa_reviewer_id: qaProfileId },
        payload: { checklist: { ...checklist, ...attest } },
      });
    });
  },

  /** QA returns the order to the estimator → REVISIONS, recording the notes + the failing checklist. */
  async returnToEstimator(
    db: DB,
    orderId: string,
    qaProfileId: string,
    actor: Actor,
    notes: string,
  ): Promise<Order> {
    return db.transaction(async (tx) => {
      const order = await ordersRepo.getById(tx, orderId);
      if (!order) throw NotFound();
      const checklist = await computeChecklist(tx, order);
      return ordersService.transition(tx, orderId, 'REVISIONS', actor, {
        set: { qa_reviewer_id: qaProfileId },
        payload: { notes, checklist },
      });
    });
  },
};
