// AI pipeline stage contracts (P2-01) — the fixed input/output seam between the inference plane
// (Python) and the orchestration/API plane (TS). The Python side mirrors these via the generated
// JSON Schema (stage-contracts.schema.json); both planes validate the same fixtures identically.
export * from './shapes';
export * from './contracts';
