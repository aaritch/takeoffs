import { z } from 'zod';

/** The auto-computed QA checklist a SERVICE_QA reviewer sees for an order (P3-06). */
export const QaChecklistView = z.object({
  scaleConfirmed: z.boolean(),
  unconfirmedSheets: z.array(z.string()),
  tradesCovered: z.boolean(),
  missingTrades: z.array(z.string().uuid()),
});
export type QaChecklistView = z.infer<typeof QaChecklistView>;

export const QaChecklistResponse = z.object({ checklist: QaChecklistView });
export type QaChecklistResponse = z.infer<typeof QaChecklistResponse>;

/** POST /v1/orders/{id}/qa/approve — the reviewer's manual attestations (auto-checks must also pass). */
export const QaApproveRequest = z.object({
  quantitiesSpotChecked: z.boolean(),
  reportRenders: z.boolean(),
});
export type QaApproveRequest = z.infer<typeof QaApproveRequest>;

/** POST /v1/orders/{id}/qa/return — return to the estimator with notes. */
export const QaReturnRequest = z.object({ notes: z.string().min(1).max(4000) });
export type QaReturnRequest = z.infer<typeof QaReturnRequest>;
