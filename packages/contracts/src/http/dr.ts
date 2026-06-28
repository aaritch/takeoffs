import { z } from 'zod';

/**
 * Disaster-recovery drills (spec §15, P5-01). A restore drill verifies backups can actually be
 * restored and measures the outcome against the RPO/RTO objectives.
 */
export const DrillStatus = z.enum(['PASSED', 'FAILED']);
export type DrillStatus = z.infer<typeof DrillStatus>;

/** The full result of one drill (returned when a drill is run). */
export const DrillReportView = z.object({
  status: DrillStatus,
  integrityOk: z.boolean(),
  expectedRowCount: z.number().int(),
  restoredRowCount: z.number().int(),
  dataLossSeconds: z.number(),
  recoverySeconds: z.number(),
  withinRpo: z.boolean(),
  withinRto: z.boolean(),
  steps: z.array(z.string()),
});
export type DrillReportView = z.infer<typeof DrillReportView>;

/** A recorded drill run (for history / the schedule audit). */
export const DrillRunView = z.object({
  id: z.string().uuid(),
  status: DrillStatus,
  integrityOk: z.boolean(),
  restoredRowCount: z.number().int(),
  dataLossSeconds: z.number(),
  recoverySeconds: z.number(),
  withinRpo: z.boolean(),
  withinRto: z.boolean(),
  ranAt: z.string().datetime(),
});
export type DrillRunView = z.infer<typeof DrillRunView>;

export const RunDrillResponse = z.object({ report: DrillReportView, run: DrillRunView });
export type RunDrillResponse = z.infer<typeof RunDrillResponse>;

export const DrillRunsResponse = z.object({ runs: z.array(DrillRunView) });
export type DrillRunsResponse = z.infer<typeof DrillRunsResponse>;
