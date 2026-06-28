/**
 * Recovery objectives (spec §15, P5-01) — the RPO/RTO targets a DR drill must meet. These are the
 * bar: a region/DB loss must be recoverable within the RTO with data loss within the RPO. Pure, so a
 * drill's measured outcome can be checked deterministically.
 */
export const RPO_TARGET_SECONDS = 5 * 60; // ≤ 5 minutes of data loss (point-in-time recovery)
export const RTO_TARGET_SECONDS = 60 * 60; // ≤ 1 hour to recover

export interface RecoveryMeasurement {
  /** How far behind the loss point the last durable recovery point is (the data-loss window). */
  dataLossSeconds: number;
  /** Wall-clock time to complete the restore. */
  recoverySeconds: number;
}

export interface RecoveryEvaluation {
  withinRpo: boolean;
  withinRto: boolean;
}

export function evaluateRecovery(m: RecoveryMeasurement): RecoveryEvaluation {
  return {
    withinRpo: m.dataLossSeconds <= RPO_TARGET_SECONDS,
    withinRto: m.recoverySeconds <= RTO_TARGET_SECONDS,
  };
}
