# Azure — inference / GPU compute home (P2-02)

The processing/AI plane's second compute home (CLAUDE.md §6). The customer app + data planes stay on
Vercel + Neon + Upstash + R2; **this** hosts the GPU inference worker (and later the training/eval
jobs). Chosen: **Azure Container Apps** — it scales on queue depth and **to zero when idle**, which is
exactly the P2-02 caveat (GPU cost is the primary margin risk; pay per-second only while a sheet is
inferring, never for idle nodes).

## Provisioned (2026-07-06)

| Resource | Name | Notes |
| --- | --- | --- |
| Subscription | `Azure subscription 1` (`11ac026d-…`) | tenant `864774d8-…` (same as the Entra OIDC app) |
| Region | **westus3** | supports Container Apps + Consumption/dedicated GPU (for the SKU swap later) |
| Resource group | `rg-takeoff-ai` | tag `project=takeoff-ai` |
| Container registry | `crtakeoffai11ac02.azurecr.io` | Basic, admin-enabled |
| Log Analytics | `log-takeoff-ai` | Container Apps logs |
| Container Apps env | `cae-takeoff-ai` | Consumption; scale-to-zero capable |
| Providers registered | Microsoft.Compute / App / ContainerRegistry / OperationalInsights / Storage | |

Provisioning is captured in `provision.ps1` (idempotent; safe to re-run).

## Architecture

```
app plane (Vercel)  --enqueue InferenceJob-->  Upstash Redis (jobs:inference)
                                                     |  KEDA redis scaler (list length)
                                                     v  (min replicas 0 → scale to zero)
                              Azure Container App: ca-inference-worker  (apps/ai-inference image)
                                                     |  publish SheetInferenceResult
                                                     v
                                              Upstash Redis (jobs:inference-results)  --> app ingests
                                                                                          authoritatively
```

- The worker image is `apps/ai-inference/Dockerfile` (the P2-02 skeleton: drains a job → no-op
  pipeline → publishes a `SheetInferenceResult`; `--selftest` proves it end to end at build time).
- **GPU is a SKU swap, not an app rewrite:** add a GPU workload profile to the env and set the app's
  workload profile + a CUDA base image once quota lands.

## Blockers (all account-level, not code — need you to clear)

1. **GPU quota = 0.** Fresh pay-as-you-go sub: `NCASv3_T4` / `NCADSA10v4` / `NCADS_A100_v4` all
   limit 0, Total Regional vCPUs 0/4. Request a T4 (Portal → Quotas → Compute → West US 3 →
   *Standard NCASv3_T4 Family vCPUs* → 4). New subs are often denied until there's billing history.
2. **ACR Tasks (cloud `az acr build`) not permitted** on this new sub (`TasksOperationsNotAllowed`) —
   so images must be built elsewhere (local Docker or CI) and pushed. Azure support can enable it.
3. **Local Docker Desktop won't start** (WSL bootstrap failure) on this machine — so no local build
   right now either. Fix Docker Desktop, or add a CI job to build+push the image to ACR.

Until (2) or (3) is cleared the image can't be pushed and the Container App can't be deployed; until
(1) is cleared it can only run **CPU** (fine for the no-op skeleton). None of this blocks the
host-agnostic code (P2-02 worker skeleton is built + tested; P2-03 orchestration + P4-05/06 next).

## Deploy runbook (ready once a build path exists)

```powershell
$RG="rg-takeoff-ai"; $ACR="crtakeoffai11ac02"; $ENV="cae-takeoff-ai"
$IMG="$ACR.azurecr.io/takeoff-inference:skel-0.1"

# 1) Build + push the worker image (pick ONE that works in your environment):
#    a) local Docker:   docker build -t $IMG apps/ai-inference ; az acr login -n $ACR ; docker push $IMG
#    b) ACR cloud build (once enabled):  az acr build --registry $ACR --image takeoff-inference:skel-0.1 apps/ai-inference

# 2) Deploy the worker, scale-to-zero, KEDA Redis scaler on jobs:inference depth.
#    REDIS_URL is the Upstash connection string (already in Vercel env) — provide it as a secret.
az containerapp create -n ca-inference-worker -g $RG --environment $ENV `
  --image $IMG --registry-server "$ACR.azurecr.io" `
  --min-replicas 0 --max-replicas 4 `
  --secrets "redis-url=<UPSTASH_REDIS_URL>" `
  --env-vars "REDIS_URL=secretref:redis-url" `
  --scale-rule-name inference-queue --scale-rule-type redis `
  --scale-rule-metadata "listName=jobs:inference" "listLength=1" `
                        "addressFromEnv=REDIS_URL" "enableTLS=true" `
  --scale-rule-auth ""   # Upstash uses the URL's password; see KEDA redis scaler docs

# 3) GPU (after quota): add a GPU workload profile + point the app at it + a CUDA image.
# az containerapp env workload-profile add -g $RG -n $ENV --workload-profile-name gpu-t4 \
#   --workload-profile-type Consumption-GPU-NC8as-T4   # (profile type per region availability)
```
