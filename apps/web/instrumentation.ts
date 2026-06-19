import { createLogger } from '@takeoff/observability';

/**
 * Next.js calls `register()` once at server startup (Node runtime). This is the distributed-
 * tracing scaffold (P0-09): it stands up the hook now, before there's much to trace, so wiring a
 * real exporter later is a localized change. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, initialise
 * OpenTelemetry here (e.g. `@vercel/otel`'s `registerOTel`) so spans export to the collector;
 * until then the correlation id on every log line is the cross-service link.
 */
export function register(): void {
  const logger = createLogger({ service: 'takeoff-web' });
  const tracingConfigured = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  logger.info('instrumentation registered', {
    event: 'startup',
    runtime: process.env.NEXT_RUNTIME,
    tracing: tracingConfigured ? 'otlp' : 'disabled',
  });
}
