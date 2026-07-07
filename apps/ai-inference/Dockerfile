# Inference worker image (P2-02). A slim CPU image running the worker skeleton (no-op pipeline).
# Deployed to Azure Container Apps; scales on jobs:inference depth and to zero when idle. The GPU
# base image + model weights are swapped in once the compute home + trained models exist (a base-
# image + SKU change, not an app rewrite).
FROM python:3.11-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# Only the runtime deps the worker needs (the deterministic stages need nothing extra; the real
# model runtime lands with the GPU image).
RUN pip install --no-cache-dir "redis>=5.0"

COPY app ./app

# Prove the image runs end to end at build time (queue→worker→result with a no-op pipeline).
RUN python -m app.serving --selftest

CMD ["python", "-m", "app.serving"]
