"""
Inference serving skeleton (P2-02). Drains per-sheet ``InferenceJob``s off the broker, resolves the
pinned model versions from the registry, runs the staged pipeline, and publishes a
``SheetInferenceResult`` the app plane ingests as candidate measurements.

This is the SKELETON: the pipeline is a no-op (the real staged detectors land in P2-04/06/07, and
per-stage persistence + partial-failure in P2-03), and the model registry echoes pinned versions
rather than loading real weights (which arrive with the GPU compute home + trained models). The I/O
boundaries (job source, result sink) are seams so the worker is fully testable without live Redis or
a GPU. Deployed on Azure Container Apps, scaling on queue depth and to zero when idle (P2-02 caveat).
"""
