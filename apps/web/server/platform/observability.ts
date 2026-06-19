import { AsyncLocalStorage } from 'node:async_hooks';
import { CORRELATION_ID_HEADER, type ErrorEnvelope } from '@takeoff/contracts';
import {
  coerceCorrelationId,
  createLogger,
  recordError,
  recordMetric,
  type Logger,
} from '@takeoff/observability';

/**
 * Request-scoped observability for the Node runtime (route handlers). The edge middleware stamps
 * the correlation id on every request header; here we read it, bind it to a logger, and stash
 * both in AsyncLocalStorage so any code in the call tree can `getLogger()` and have its lines
 * automatically carry the correlation id — no manual threading. AsyncLocalStorage is Node-only,
 * which is why this lives in the app's platform layer, not the edge-safe @takeoff/observability
 * package.
 */

interface RequestContext {
  correlationId: string;
  logger: Logger;
}

const store = new AsyncLocalStorage<RequestContext>();

/** Base logger used outside any request (startup, scripts) and as the parent for request loggers. */
export const baseLogger: Logger = createLogger({ service: 'takeoff-web' });

/** The correlation id carried by the current request, or generated if none is present. */
export function getCorrelationId(headers: Headers): string {
  return coerceCorrelationId(headers.get(CORRELATION_ID_HEADER));
}

/** The request-scoped logger (carries correlationId), or the base logger outside a request. */
export function getLogger(): Logger {
  return store.getStore()?.logger ?? baseLogger;
}

/** The current request's correlation id, if called within a request context. */
export function getCurrentCorrelationId(): string | undefined {
  return store.getStore()?.correlationId;
}

function errorResponse(correlationId: string): Response {
  const body: ErrorEnvelope = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { 'content-type': 'application/json', [CORRELATION_ID_HEADER]: correlationId },
  });
}

/**
 * Wrap a route handler so it runs inside a correlation-bound logging context. Sets the
 * correlation id on the response, emits a request-complete metric, and turns an uncaught error
 * into a 500 with the standard error envelope (and an `event:"error"` log that the error-rate
 * alert counts). Use from a Route Handler:
 *
 *   export const GET = (req: Request) => withRequestContext(req, async ({ logger }) => { ... });
 */
export async function withRequestContext(
  request: Request,
  handler: (ctx: RequestContext) => Response | Promise<Response>,
): Promise<Response> {
  const correlationId = getCorrelationId(request.headers);
  const logger = baseLogger.child({ correlationId });
  const ctx: RequestContext = { correlationId, logger };
  const start = Date.now();

  return store.run(ctx, async () => {
    const route = new URL(request.url).pathname;
    try {
      const res = await handler(ctx);
      res.headers.set(CORRELATION_ID_HEADER, correlationId);
      recordMetric(logger, 'request_complete', 1, {
        route,
        method: request.method,
        status: res.status,
        durationMs: Date.now() - start,
      });
      return res;
    } catch (err) {
      recordError(logger, err, { route, method: request.method, durationMs: Date.now() - start });
      return errorResponse(correlationId);
    }
  });
}
