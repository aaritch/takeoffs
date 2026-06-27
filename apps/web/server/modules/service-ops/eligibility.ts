/**
 * Estimator-matching logic (P3-04), pure so it's exhaustively testable without a database. An order
 * is matched to a SERVICE_ESTIMATOR by trade specialty, current capacity, and priority; the actual
 * profile/order rows are loaded by the assignment service and reduced to {@link EstimatorCandidate}s.
 */

export interface EstimatorCandidate {
  profileId: string;
  specialties: string[];
  active: boolean;
  currentLoad: number;
  maxConcurrent: number;
}

/** Whether an estimator's specialties cover the order's trades (any overlap; no trades ⇒ any). */
export function specialtiesMatch(specialties: string[], requestedTrades: string[]): boolean {
  if (requestedTrades.length === 0) return true;
  const set = new Set(specialties);
  return requestedTrades.some((t) => set.has(t));
}

/** An estimator is assignable when active, under capacity, and a trade-specialty match. */
export function isEligible(c: EstimatorCandidate, requestedTrades: string[]): boolean {
  return (
    c.active && c.currentLoad < c.maxConcurrent && specialtiesMatch(c.specialties, requestedTrades)
  );
}

/**
 * Pick the best estimator for an order, or null if none is eligible (the order then waits visibly
 * rather than failing). Prefer the least-loaded, breaking ties by the most spare capacity.
 */
export function pickEstimator(
  candidates: EstimatorCandidate[],
  requestedTrades: string[],
): EstimatorCandidate | null {
  const eligible = candidates
    .filter((c) => isEligible(c, requestedTrades))
    .sort(
      (a, b) =>
        a.currentLoad - b.currentLoad ||
        b.maxConcurrent - b.currentLoad - (a.maxConcurrent - a.currentLoad) ||
        a.profileId.localeCompare(b.profileId),
    );
  return eligible[0] ?? null;
}
