import { z } from 'zod';

/**
 * Cross-boundary observability contract (P0-09). The correlation id originates at the client,
 * travels on this HTTP header into the API, and must then ride on every job/event payload so a
 * single logical request can be followed across services (API → broker → workers). Defining the
 * header name and the message field ONCE here — before Phase 1 spreads work across services —
 * is the whole point of the P0-09 caveat: retrofitting tracing later is painful.
 */

/** HTTP header carrying the correlation id between the client, the API, and downstream calls. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Mixin schema for any cross-service message (background job, realtime event) so the correlation
 * id flows through the broker, not just the HTTP edge. Compose with `.merge()` / spread on the
 * concrete job/event schemas as they land in Phase 1.
 */
export const Traceable = z.object({
  /** The correlation id of the request that originated this message. */
  correlationId: z.string().min(1),
});
export type Traceable = z.infer<typeof Traceable>;
