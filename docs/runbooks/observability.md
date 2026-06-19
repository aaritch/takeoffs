# Runbook: observability (P0-09)

The skeleton that makes the system debuggable before Phase 1 spreads work across services:
**structured logs + a correlation id on every request**, **log-based metrics**, and a
**tracing scaffold**. The dashboard + alert are configured in the hosting provider (Vercel).

## Correlation id — the contract

`CORRELATION_ID_HEADER` (`x-correlation-id`) is defined once in `@takeoff/contracts`
(`Traceable` is the matching mixin for job/event payloads). One logical request carries one id
across every hop, so logs/traces can be stitched together.

- **Where it's set:** the edge middleware (`apps/web/middleware.ts`) trusts a valid inbound
  `x-correlation-id` or mints a UUID v7, then propagates it to the handler (request header) **and**
  the client (response header).
- **Where it's used:** route handlers wrap their logic in `withRequestContext`
  (`apps/web/server/platform/observability.ts`), which binds the id to a request-scoped logger
  via `AsyncLocalStorage`. Any code deep in the call tree calls `getLogger()` and its lines carry
  the id automatically — no manual threading.
- **Phase 1+ across services:** when the API enqueues a job or emits an event, copy the id onto
  the message (`Traceable.correlationId`) so workers/realtime keep logging under the same id.

## Logs

`@takeoff/observability`'s `createLogger` emits **one JSON object per line**
(`{ time, level, msg, correlationId, ... }`). Sensitive keys (`password`, `token`,
`authorization`, …) are auto-redacted. Levels gate on `LOG_LEVEL` (default `info`). On Vercel,
stdout/stderr are captured and indexed; JSON means every field is queryable.

**Follow one request:** filter the logs by its `correlationId` (returned in the response
`x-correlation-id` header) to see every line it produced across services.

## Metrics (log-based)

Serverless has no shared in-process counters, so metrics are structured log **events** a drain
aggregates: `recordMetric()` emits `event:"metric"` lines (e.g. `request_complete` with
`status`/`durationMs`; `errors_total`). `withRequestContext` records `request_complete` for every
request and `recordError` ticks `errors_total` + emits an `event:"error"` line on failure.

Baseline request rate / latency / error rate are also available automatically in **Vercel →
Observability** (and Speed Insights), no code required.

## Tracing scaffold

`apps/web/instrumentation.ts` `register()` runs at startup. It's wired but minimal: when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set, initialise OpenTelemetry there (e.g. `@vercel/otel`'s
`registerOTel`) to export spans. Until then, the correlation id on logs is the cross-service link.

## Dashboard + alert (Vercel — manual config)

1. **Dashboard:** Vercel project → **Observability** shows request rate, p50/p95 latency, and
   error rate out of the box. `/api/health` reports integration wiring.
2. **First alert (error-rate spike):** Vercel → Monitoring/Alerts (or a connected log drain such
   as Datadog/Better Stack) → alert when the error rate / count of `event:"error"` (or HTTP 5xx)
   exceeds a threshold over a short window. Route it to email/Slack.
3. **Test the alert in staging:** hit `GET /api/health?fail=1`. It throws, so the handler returns
   the 500 envelope and emits an `event:"error"` line + `errors_total` tick — exactly what the
   alert watches. Confirm the alert fires, then stop.

> Why this exists now (P0-09 caveat): retrofitting tracing after services multiply is painful, so
> the correlation-id contract and log shape must exist **before** Phase 1 spreads work across the
> API, broker, and workers.
