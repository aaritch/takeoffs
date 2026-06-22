# ai-inference (Python, processing/AI plane)

The AI inference plane (spec §3.3, Plan §4.6). **Not on Vercel** — it runs on the Phase-2 compute
home (GPU; host TBD). It owns the staged detection pipeline per sheet and emits candidate
measurements with confidence; it must never treat its output as authoritative, write final
quantities, or pass the scale gate below threshold.

## Current state (P2-01)

Only the **contract mirror** exists. `app/contracts` loads the language-neutral JSON Schema that
`@takeoff/contracts` emits from its Zod source of truth
(`packages/contracts/stage-contracts.schema.json`) and validates stage payloads against it — so the
Python and TypeScript planes enforce the _same_ stage seam with no second copy to drift. The
`tests/` validate the shared fixtures (`packages/contracts/stage-fixtures.json`) identically to the
TypeScript side.

The pipeline/stages/models/serving packages land in later Phase-2 tasks (P2-02+), once the GPU
compute home is chosen.

## Develop

```bash
cd apps/ai-inference
python -m pip install -e ".[dev]"
python -m pytest
```

When a stage contract changes, regenerate the schema artifact on the TS side
(`pnpm --filter @takeoff/contracts gen:schemas`) and commit it; both planes' tests then re-pin to
the new contract.
