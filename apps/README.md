# apps/

Deployable applications. Each app ships independently.

| App              | Plane              | Host                       | Lands in                                                         |
| ---------------- | ------------------ | -------------------------- | ---------------------------------------------------------------- |
| `web`            | Application        | **Vercel**                 | Phase 0 (P0-05+) — Next.js: UI **and** the synchronous `/v1` API |
| `worker-files`   | Processing         | Phase-2 compute host       | Phase 1 — ingest, rasterize, tile, extract, index                |
| `worker-exports` | Processing         | Phase-2 compute host       | Phase 1 — report/export generation                               |
| `realtime`       | Application (live) | Phase-2 compute host       | Phase 1 — WebSocket gateway (presence, deltas)                   |
| `ai-inference`   | AI/ML              | Phase-2 compute host (GPU) | Phase 2 — Python/FastAPI staged pipeline                         |

Rules:

- Apps import shared code only from `@takeoff/*` package roots — never another app's or
  package's internals (enforced by ESLint).
- The `web` API **enqueues** heavy work and reads status; it never runs long/heavy compute
  inline (Vercel functions are short-lived). Workers drain the queue off-Vercel.
- `ai-inference` is a Python project (own `pyproject`/`requirements`), excluded from the
  pnpm workspace.

Create an app's folder only when its phase begins.
