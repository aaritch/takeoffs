// @takeoff/observability — edge-safe logging, correlation, and log-based metrics.
// Shared by the web API and (in Phase 1+) the workers/realtime services so the correlation-id
// contract and log shape are identical everywhere. Node-only request-context (AsyncLocalStorage)
// lives in each service's own platform layer, not here, to keep this package edge-safe.
export * from './correlation';
export * from './logger';
export * from './metrics';
