# Runbook: GPU compute home setup (Azure inference plane)

**Status: FOUNDATION PROVISIONED (2026-07-06) · deploy blocked on account limits.** The Azure
foundation (resource group, registry, Log Analytics, scale-to-zero Container Apps environment) is up
and captured in [`infra/azure/provision.ps1`](../../infra/azure/provision.ps1); the reference
(architecture, resource names) is [`infra/azure/README.md`](../../infra/azure/README.md). This runbook
is the **operator's step-by-step** to take it from "foundation" to "GPU inference worker draining the
queue" — including the three account-level blockers only the subscription owner can clear.

Why a second compute home at all: Vercel can't run GPU inference, long workers, or persistent
WebSocket gateways (CLAUDE.md §5/§6). The customer app + data planes stay on Vercel + Neon + Upstash +
R2; **this** plane hosts the GPU inference worker (and later the training/eval jobs from
[`ml/`](../../ml/)). It talks to the app plane **only** through Upstash Redis (job in, result out) —
never by reaching into it.

---

## 0. Prerequisites

- An **Azure subscription** you own (billing set up) and the **Azure CLI** installed
  (`winget install Microsoft.AzureCLI`). On this machine `az` is not on PATH in non-interactive
  shells — the full path is `"$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`.
- The **Upstash Redis** connection string (`REDIS_URL`) — the same one in the Vercel project env
  (`.env.example`). The worker and the app share this one broker.
- The inference worker image source: [`apps/ai-inference/`](../../apps/ai-inference/) (its
  `Dockerfile` runs `python -m app.serving --selftest` at build time, so a green build proves the
  worker drains→runs→publishes end to end).

Authenticate (device code works in this environment; a browser login is fine elsewhere):

```powershell
& "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" login --use-device-code
# confirm the right subscription is active:
az account show --query "{name:name, id:id, tenant:tenantId}" -o table
```

---

## 1. Provision the foundation (idempotent)

Run the provisioning script. It registers the resource providers (fresh subscriptions have **none**
registered), then creates the resource group, registry, Log Analytics workspace, and the
scale-to-zero Container Apps environment. Safe to re-run.

```powershell
pwsh infra/azure/provision.ps1
```

This creates (region **westus3** — it supports Container Apps + the Consumption-GPU profiles used in
step 6):

| Resource           | Name                           |
| ------------------ | ------------------------------ |
| Resource group     | `rg-takeoff-ai`                |
| Container registry | `crtakeoffai11ac02.azurecr.io` |
| Log Analytics      | `log-takeoff-ai`               |
| Container Apps env | `cae-takeoff-ai`               |

---

## 2. Clear the three account-level blockers (owner action)

These are **subscription limits, not code.** All three were open on the fresh pay-as-you-go
subscription as of 2026-07-06.

### 2a. GPU quota (needed only for real inference, not the CPU skeleton)

A new subscription has **0** GPU vCPUs (`NCASv3_T4` / `NCADSA10v4` / `NCADS_A100_v4` all limit 0;
Total Regional vCPUs 0/4). Request a T4 to start (cheapest, enough for the detectors):

- Portal → **Quotas** → **Compute** → region **West US 3** → **Standard NCASv3_T4 Family vCPUs** →
  request **4** (one 4-vCPU T4 node). Or via CLI: `az quota update` against the
  `Microsoft.Compute` provider for that SKU family.
- New subscriptions are frequently auto-denied until there's billing history — if so, open a
  **support request** ("increase regional GPU quota") referencing the subscription id.

Until this clears the worker runs **CPU-only**, which is fine for the current no-op skeleton (it
does no model math yet).

### 2b. A build path for the image

Cloud build via `az acr build` is disabled on a new subscription (`TasksOperationsNotAllowed`), and
local Docker Desktop may be broken (WSL bootstrap failure on this machine). Clear **one** of:

- Enable **ACR Tasks** through Azure support (then `az acr build` works — no local Docker needed), **or**
- Fix **Docker Desktop** locally (build + push from your machine), **or**
- Use the **GitHub Actions** build job in step 3c (recommended — no local Docker, no ACR Tasks).

### 2c. (Only if building locally) Docker Desktop

If you go the local-Docker route, Docker Desktop must actually start. If it fails to bootstrap WSL,
either repair it or fall back to the CI build (3c).

---

## 3. Build and push the worker image

Pick the option matching what you cleared in 2b. Target tag:

```
crtakeoffai11ac02.azurecr.io/takeoff-inference:skel-0.1
```

### 3a. Local Docker

```powershell
$IMG="crtakeoffai11ac02.azurecr.io/takeoff-inference:skel-0.1"
docker build -t $IMG apps/ai-inference
az acr login -n crtakeoffai11ac02
docker push $IMG
```

### 3b. ACR cloud build (once ACR Tasks is enabled)

```powershell
az acr build --registry crtakeoffai11ac02 --image takeoff-inference:skel-0.1 apps/ai-inference
```

### 3c. GitHub Actions (no local Docker, no ACR Tasks) — recommended

Add a **manually-triggered** workflow (kept off the PR/push CI so it never runs on every commit).
Give the repo an Azure service principal with `AcrPush` on the registry, stored as repo secrets
(`AZURE_CREDENTIALS`, or OIDC federation). Sketch:

```yaml
# .github/workflows/build-inference-image.yml
name: Build inference image
on: { workflow_dispatch: { inputs: { tag: { default: skel-0.1 } } } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with: { creds: ${{ secrets.AZURE_CREDENTIALS }} }
      - run: az acr login -n crtakeoffai11ac02
      - run: |
          IMG=crtakeoffai11ac02.azurecr.io/takeoff-inference:${{ inputs.tag }}
          docker build -t "$IMG" apps/ai-inference
          docker push "$IMG"
```

---

## 4. Deploy the worker (scale-to-zero + queue autoscale)

Deploy the Container App with a **KEDA Redis list scaler** on the `jobs:inference` queue depth and
`--min-replicas 0`, so it costs nothing while idle and scales up per queued sheet (the P2-02 caveat:
GPU time is the margin risk — pay per-second only while inferring). Pass the Upstash URL as a secret.

```powershell
$RG="rg-takeoff-ai"; $ACR="crtakeoffai11ac02"; $ENV="cae-takeoff-ai"
$IMG="$ACR.azurecr.io/takeoff-inference:skel-0.1"

az containerapp create -n ca-inference-worker -g $RG --environment $ENV `
  --image $IMG --registry-server "$ACR.azurecr.io" `
  --min-replicas 0 --max-replicas 4 `
  --secrets "redis-url=<UPSTASH_REDIS_URL>" `
  --env-vars "REDIS_URL=secretref:redis-url" `
  --scale-rule-name inference-queue --scale-rule-type redis `
  --scale-rule-metadata "listName=jobs:inference" "listLength=1" `
                        "addressFromEnv=REDIS_URL" "enableTLS=true"
```

Notes:

- `jobs:inference` (in) and `jobs:inference-results` (out) are the queue names from
  `@takeoff/contracts` (`INFERENCE_QUEUE` / the results queue); keep them in sync with the code, not
  hand-typed drift.
- Upstash authenticates via the password embedded in `REDIS_URL` with TLS — hence `enableTLS=true`
  and `addressFromEnv`. If your KEDA version needs an explicit trigger auth, see the KEDA Redis
  scaler docs and add `--scale-rule-auth`.

---

## 5. Verify

```powershell
# a) The image's own end-to-end selftest ran at build time (Dockerfile: python -m app.serving --selftest).
# b) Watch the worker come alive and drain:
az containerapp logs show -n ca-inference-worker -g rg-takeoff-ai --follow

# c) Enqueue a real run from the app (POST /v1/plan-sets/{id}/model-runs) or push a synthetic
#    InferenceJob onto jobs:inference, then confirm:
#    - replicas scale 0 → N while the queue is non-empty, back to 0 when drained;
#    - a SheetInferenceResult lands on jobs:inference-results.
```

The app plane records the result **authoritatively** — the worker's output is a candidate set, never
final quantities (CLAUDE.md invariant #1 + the scale gate).

---

## 6. GPU SKU swap (after quota lands) — not an app rewrite

The worker is CPU/GPU-agnostic; going GPU is a **profile + base-image** change, not new code:

```powershell
# Add a GPU workload profile to the environment (type per region availability):
az containerapp env workload-profile add -g rg-takeoff-ai -n cae-takeoff-ai `
  --workload-profile-name gpu-t4 --workload-profile-type Consumption-GPU-NC8as-T4

# Point the app at it and deploy a CUDA-based image tag:
az containerapp update -n ca-inference-worker -g rg-takeoff-ai --workload-profile-name gpu-t4
```

When the real detectors (P2-04/06/07) land, the image's base becomes a CUDA runtime and the model
weights ship with it (or are pulled from R2 / the model registry at start). The
[`ml/`](../../ml/) training pipeline (P4-05) produces the candidate versions the app-plane registry
(P4-06, `POST /v1/ops/models`) promotes — the worker then serves the **ACTIVE** version per family.

---

## 7. Wire the live results consumer (finishes P2-03)

The worker publishes to `jobs:inference-results`, but the app-plane **consumer** that drains it is the
remaining P2-03 wiring (it exists as tested logic — `aiRunsService.ingestSheetResult` +
`finalizeFromSheets` — but nothing drains the queue in a deployed process yet). Once the worker is
live, run a small Node consumer (on this same compute home, not Vercel) that: `brpop`
`jobs:inference-results` → `ingestSheetResult` per sheet → `finalizeFromSheets` when a run's sheets
are all in. Deploy it as a second Container App (or a sidecar) reading the same `REDIS_URL`.

---

## 8. Teardown / cost

- Idle cost is ~nil: Container Apps scale to **zero** replicas; you pay for the registry (Basic) and
  Log Analytics ingestion only. No standing GPU node.
- Tear the whole plane down with `az group delete -n rg-takeoff-ai` (irreversible — deletes the
  registry + env + all apps; the app/data planes on Vercel/Neon/Upstash/R2 are untouched).

---

## Troubleshooting

| Symptom                                                | Cause / fix                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `TasksOperationsNotAllowed` on `az acr build`          | ACR Tasks disabled on a new sub (2b) — use local Docker (3a) or CI (3c), or ask support to enable.           |
| GPU quota / `NCASv3_T4` limit 0                        | Fresh-sub GPU quota is 0 (2a) — request via Portal → Quotas, or a support request.                           |
| `az` "not recognized"                                  | Not on PATH in non-interactive shells — use the full `...\CLI2\wbin\az.cmd` path.                            |
| `az` calls fail with `AADSTS50132 InteractionRequired` | Token expired — re-run `az login --use-device-code`.                                                         |
| Providers "not registered" errors on create            | Fresh sub — re-run `provision.ps1` (it registers Compute/App/ContainerRegistry/OperationalInsights/Storage). |
| Worker never scales up                                 | Check the KEDA rule `listName`/`addressFromEnv`/`enableTLS` and that `REDIS_URL` reaches Upstash over TLS.   |
