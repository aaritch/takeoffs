// Review module (P2-10/P2-11) — human review actions over AI candidates (accept, reject,
// edit-geometry, reclassify, add-missed, bulk-accept), each server-authoritative (rollup recomputed
// from the authoritative set) and each capturing a DetectionFeedback row (the flywheel's training
// signal — the P2-11 GATE). Capture commits in the same transaction as the state change.
export { reviewService } from './service';
export type { Actor } from './service';
export { detectionFeedbackRepo } from './repository';
export type { DetectionFeedback } from './repository';
