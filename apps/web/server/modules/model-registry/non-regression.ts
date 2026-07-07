/**
 * Benchmark non-regression gate (invariant §6, spec §7.4, P4-06). A candidate model may be promoted
 * only if it does not regress ANY metric the current ACTIVE version is measured on, against the frozen
 * benchmark. Metrics are keyed per-metric and per-class (e.g. `precision`, `wall.recall`); higher is
 * always better (store error metrics as their complement, e.g. 1 - MAE, so the "≥" rule holds
 * uniformly). Pure and exhaustively testable — the gate must be impossible to bypass by accident.
 *
 * `tolerance` (default 0) is the allowed slack per metric; a candidate passes a metric when
 * `candidate >= active - tolerance`. A metric absent from the candidate counts as a regression (you
 * cannot promote a version you never measured on a tracked metric). Extra candidate-only metrics are
 * ignored — the ACTIVE version defines the tracked set.
 */
export interface MetricRegression {
  metric: string;
  active: number;
  candidate: number | null;
  delta: number | null;
}

export interface NonRegressionResult {
  ok: boolean;
  regressions: MetricRegression[];
}

export function nonRegresses(
  candidate: Record<string, number>,
  active: Record<string, number>,
  tolerance = 0,
): NonRegressionResult {
  const regressions: MetricRegression[] = [];
  for (const [metric, activeValue] of Object.entries(active)) {
    const candidateValue = candidate[metric];
    if (candidateValue === undefined) {
      regressions.push({ metric, active: activeValue, candidate: null, delta: null });
      continue;
    }
    const delta = candidateValue - activeValue;
    if (candidateValue < activeValue - tolerance) {
      regressions.push({ metric, active: activeValue, candidate: candidateValue, delta });
    }
  }
  return { ok: regressions.length === 0, regressions };
}
