# Idempotent provisioning of the Azure inference/GPU compute home (P2-02). Safe to re-run.
# Requires an authenticated Azure CLI (`az login`). See README.md for architecture + blockers.
$ErrorActionPreference = "Stop"

$LOC = "westus3"
$RG  = "rg-takeoff-ai"
$ACR = "crtakeoffai11ac02"        # globally unique; suffix = subscription-id prefix
$LAW = "log-takeoff-ai"
$ENV = "cae-takeoff-ai"
$TAGS = "project=takeoff-ai"

# Resolve az (it may not be on PATH in a non-interactive shell).
$az = (Get-Command az -ErrorAction SilentlyContinue).Source
if (-not $az) { $az = "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" }

Write-Host "Registering resource providers..."
foreach ($ns in @("Microsoft.Compute", "Microsoft.App", "Microsoft.ContainerRegistry", "Microsoft.OperationalInsights", "Microsoft.Storage")) {
  & $az provider register --namespace $ns | Out-Null
}

Write-Host "Resource group $RG ($LOC)..."
& $az group create -n $RG -l $LOC --tags $TAGS | Out-Null

Write-Host "Container registry $ACR..."
& $az acr create -n $ACR -g $RG -l $LOC --sku Basic --admin-enabled true --tags $TAGS | Out-Null

Write-Host "Log Analytics $LAW..."
& $az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC --tags $TAGS | Out-Null

Write-Host "Installing containerapp extension + creating environment $ENV..."
& $az extension add --name containerapp --upgrade --only-show-errors | Out-Null
$wsId  = & $az monitor log-analytics workspace show -g $RG -n $LAW --query customerId -o tsv
$wsKey = & $az monitor log-analytics workspace get-shared-keys -g $RG -n $LAW --query primarySharedKey -o tsv
& $az containerapp env create -n $ENV -g $RG -l $LOC --logs-workspace-id $wsId --logs-workspace-key $wsKey --tags $TAGS | Out-Null

Write-Host "Foundation ready. Next: build+push the image and deploy the worker (see README.md runbook)."
