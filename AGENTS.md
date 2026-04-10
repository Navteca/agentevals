# AGENTS.md — agentevals

## What this repo is

agentevals scores AI agent behavior from **existing OTel traces**. No agent re-execution, no cloud dependency. The product has five surfaces: CLI, FastAPI backend, OTLP receivers (HTTP :4318, gRPC :4317), React UI, and an MCP server.

Package name on PyPI: `agentevals-cli`. Entry point: `agentevals.cli:main`.

---

## Developer commands

```bash
uv sync                         # install deps (Python ≥ 3.11 required)

# Development (two terminals)
make dev-backend                # FastAPI + OTLP receivers, hot reload, port 8001
make dev-frontend               # Vite dev server on port 5173 (proxies nothing — calls :8001 directly)

# Tests
make test                       # unit + integration (no API keys needed)
make test-unit                  # fast, TestClient/mocks only
make test-integration           # OTLP pipeline, session grouping (ASGI in-process, no ports)
make test-e2e                   # real agents as subprocesses; needs OPENAI_API_KEY / GOOGLE_API_KEY
# E2E shorthand:
set -a && source .env && set +a && make test-e2e

# Build
make build                      # core wheel → dist/
make build-bundle               # builds UI first, embeds into wheel
make clean
```

`agentevals` on PATH after `pip install agentevals-cli`. In repo use `uv run agentevals`.

---

## Repo layout

```
src/agentevals/          # backend
  cli.py                 # CLI entry point
  runner.py              # main eval orchestration
  converter.py           # trace format detection + ADK conversion
  genai_converter.py     # OTel GenAI semconv conversion
  extraction.py          # shared span extraction
  builtin_metrics.py     # wires ADK evaluators
  custom_evaluators.py   # external evaluator subprocess protocol
  api/                   # FastAPI app, OTLP routes, streaming routes
  streaming/             # WebSocket session manager, OTel processors
  loader/                # Jaeger JSON and OTLP JSON file loaders
ui/                      # React + Vite frontend
packages/evaluator-sdk-py/  # evaluator stdin/stdout SDK
charts/agentevals/       # Helm chart
tests/                   # unit tests
tests/integration/       # OTLP pipeline + session grouping tests
samples/                 # example Jaeger traces + eval sets for quick CLI runs
examples/                # zero-code and SDK examples per framework
docs/                    # otel-compatibility.md, streaming.md, eval-set-format.md, codebase-deep-dive.md
```

---

## OTel Collector — is it required?

**No. agentevals has its own OTLP receivers built in (HTTP :4318, gRPC :4317).** An OTel Collector is optional and useful only for:
- traffic shaping / batching before agentevals
- fan-out to additional backends
- protocol translation (gRPC-only clients that cannot reach the agentevals HTTP endpoint)

The Kubernetes example in `examples/kubernetes/README.md` says explicitly:

> "Native gRPC ingestion in agentevals is sufficient for most setups, but an intermediate collector is still useful when you want centralized telemetry controls."

---

## Current cluster state (verified 2026-04-10)

Deployed via Terraform at `terraform-cloud/projects/existing-cluster-agentregistry/` in the `aregistry` repo.

| Component | Namespace | Source |
|---|---|---|
| `agentevals` | `agentevals` | `helm_release.agentevals` — ECR OCI chart, `helm-values/agent-evals.yaml`, image `ECR:navteca/images/agentevals:0.5.2-grpc` |
| `otel-collector` | `agentevals` | `helm_release.otel_collector` — **commented out / removed** |
| `kagent` | `kagent` | `helm_release.kagent` — `helm-values/kagent.yaml` |
| `usgs-agent` | `default` | kAgent-managed deployment (created by kagent controller from `Agent` CRD) |
| `ia-navteca-usgs-mcp` | `default` | kAgent-managed MCP server (from `MCPServer` CRD, deployed via Agent Registry) |

### Why the collector was there (and why it is gone)

kAgent sets `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` on every agent pod it creates via the `kagent-controller` ConfigMap. The endpoint comes from `otel.tracing.exporter.otlp.endpoint` in `helm-values/kagent.yaml`.

Previously that was `otel-collector-opentelemetry-collector.agentevals.svc.cluster.local:4317`. The collector's config (`helm-values/otel-collector.yaml`) was a pure passthrough: gRPC in → `otlphttp` out → `agentevals.agentevals.svc.cluster.local:4318`. No batching, filtering, or fan-out was configured — it was pure protocol translation overhead.

**agentevals has a native gRPC receiver on :4317** (source: `src/agentevals/api/otlp_grpc.py`). The collector solved nothing except bridge a protocol gap.

### Why removing the collector initially broke traces (full root-cause chain)

1. **Google ADK hardcodes gRPC** — the `usgs-agent` runtime initialises `OTLPSpanExporter` and `OTLPLogExporter` programmatically with the gRPC backend. `OTEL_EXPORTER_OTLP_PROTOCOL` is ignored; the agent always exports gRPC regardless of env vars.

2. **The upstream `ghcr.io/agentevals-dev/agentevals:0.6.3` image has no gRPC receiver** — despite port 4317 being declared in the Service/Deployment, nothing in that image listens there with gRPC. `--otlp-grpc-port` was only added to the CLI and Dockerfile in later local development work but was never released to that tag.

3. **Changing kagent to `:4318` + `http/protobuf` did not help** — the ADK exporter ignores the env var and kept sending gRPC frames to whatever host:port was set, causing `StatusCode.UNAVAILABLE`.

4. **Fix**: rebuild from local source (which has `otlp_grpc.py`) adding `grpcio>=1.60.0` as a dependency, build for `linux/amd64` (cluster nodes are x86), push to ECR, and update `agent-evals.yaml` to use the new image.

### What changed (Terraform-managed)

Three files were updated:

**`helm-values/agent-evals.yaml`** — switched from upstream ghcr.io image to ECR build with gRPC support:
```yaml
image:
  registry: "607399646027.dkr.ecr.us-east-1.amazonaws.com"
  repository: navteca/images/agentevals
  tag: "0.5.2-grpc"
```

**`helm-values/kagent.yaml`** — both `otel.tracing` and `otel.logging` endpoints point directly to agentevals gRPC:
```yaml
otel:
  tracing:
    exporter:
      otlp:
        endpoint: http://agentevals.agentevals.svc.cluster.local:4317
  logging:
    exporter:
      otlp:
        endpoint: http://agentevals.agentevals.svc.cluster.local:4317
```

**`main.tf`** — `helm_release.otel_collector` is commented out (with instructions to re-enable).

**The `ia-navteca-usgs-mcp` MCP server** was already pointing directly at `agentevals:4318` HTTP — no change needed there.

### Additional bug fixed: UI "Disconnected" badge (SSE 422)

`src/agentevals/api/app.py` imported `fastapi.Request` as `_Request` inside a function scope:

```python
# broken — FastAPI can't resolve _Request as fastapi.Request with annotations future
from fastapi import Request as _Request
async def ui_updates_stream(request: _Request): ...
```

With `from __future__ import annotations` active, FastAPI evaluated the annotation as a string `"_Request"` and treated `request` as a query parameter → `GET /stream/ui-updates` returned 422, breaking the SSE connection and causing the "Disconnected" badge.

**Fix** (`app.py:13`): import `Request` at module level without alias:
```python
from fastapi import FastAPI, Request
```

This fix is included in the `0.5.2-grpc` ECR image.

### To verify

```bash
# 1. Confirm otel-collector pod is gone and agentevals is running
kubectl get pods -n agentevals

# 2. Confirm usgs-agent has gRPC endpoint
kubectl get deployment usgs-agent -n default \
  -o jsonpath='{.spec.template.spec.containers[0].env}' | python3 -m json.tool | grep -A1 OTLP

# 3. Port-forward and check SSE + sessions
kubectl port-forward svc/agentevals -n agentevals 8001:8001 4317:4317 4318:4318
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/stream/ui-updates  # should be 200
# Trigger a USGS agent conversation, then:
curl -s http://localhost:8001/api/streaming/sessions | python3 -m json.tool
```

Traces from the usgs-agent appear in the agentevals "Live" tab within seconds of the agent responding.

### To revert to collector

1. Uncomment `helm_release.otel_collector` in `main.tf`
2. Revert endpoint values in `helm-values/kagent.yaml` to `otel-collector-opentelemetry-collector.agentevals.svc.cluster.local:4317`
3. `terraform apply`

### To rebuild the agentevals image

```bash
cd /path/to/agentevals
# Ensure grpcio is in pyproject.toml dependencies (it is, as of 2026-04-10)
ECR="607399646027.dkr.ecr.us-east-1.amazonaws.com/navteca/images/agentevals"
aws ecr get-login-password --region us-east-1 --profile navteca | \
  docker login --username AWS --password-stdin 607399646027.dkr.ecr.us-east-1.amazonaws.com
docker buildx build --platform linux/amd64 -t "${ECR}:<tag>" --push .
# Then update helm-values/agent-evals.yaml tag and terraform apply
```

---

## Trace formats and protocol notes

agentevals supports three content-delivery mechanisms (handles all automatically):
1. **Span attributes** — simplest, no extra config
2. **Log records** (recommended for new code) — requires both `OTLPSpanExporter` and `OTLPLogExporter`; set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`
3. **Span events** — deprecated upstream but still fully supported for backward compatibility

Auto-detects Google ADK traces (`gcp.vertex.agent` scope) vs. OTel GenAI semconv traces (`gen_ai.request.model`). ADK takes priority when both are present.

---

## Live OTLP streaming (zero-code)

```bash
# Terminal 1
agentevals serve --dev         # or: make dev-backend

# Terminal 2 (your agent)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318        # HTTP
# or for gRPC:
export OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc

export OTEL_RESOURCE_ATTRIBUTES="agentevals.session_name=my-session"
python your_agent.py
```

Sessions are grouped by `agentevals.session_name`. Set `agentevals.eval_set_id` to auto-associate with an eval set. Sessions are **in-memory only** — lost on restart. Max 100 sessions, 2h TTL, 10k spans/session.

---

## Scoring a trace offline

```bash
agentevals run samples/helm.json \
  --eval-set samples/eval_set_helm.json \
  -m tool_trajectory_avg_score

# Multiple metrics, JSON output
agentevals run trace.json \
  --eval-set eval_set.json \
  -m tool_trajectory_avg_score \
  -m response_match_score \
  --output json
```

Supported `--trajectory-match-type`: `EXACT` (default), `IN_ORDER`, `ANY_ORDER`.

---

## Key gotchas

- **Pyproject name vs package name:** package on PyPI is `agentevals-cli` but import is `agentevals`. The wheel is named `agentevals_cli-*.whl`.
- **`--dev` flag does NOT add features:** live mode (WebSocket, sessions, SSE) is always active with `agentevals serve`. `--dev` only adds hot reload and verbose console output.
- **Frontend does not proxy:** Vite dev server (`npm run dev`) calls `http://localhost:8001` directly via CORS. You must have the backend running separately.
- **MCP server requires `[live]` extra:** `pip install "agentevals-cli[live]"` adds `mcp` and `httpx` needed for `agentevals mcp`.
- **Multi-case eval-set matching is exact-string:** the runner matches traces to eval cases by exact first-user-message after lowercase/trim. No fuzzy matching — paraphrases fall back silently to the first case.
- **Rubric-based metrics are marked non-working** in the API/UI and are not fully wired through the standard evaluation path.
- **`response_evaluation_score` and `safety_v1`** require GCP/Vertex AI credentials.
- **Nix users:** `agentevals` in PATH in the Nix shell points to the immutable store derivation. Use `uv run agentevals` to run from live source.
- **File upload limit:** 10 MB per trace or eval-set file via API/UI.

---

## Claude Code skills (this repo)

Two slash-command skills in `.claude/skills/`, auto-loaded in this repo:

| Skill | Purpose |
|---|---|
| `/eval` | Score traces or compare sessions against a golden reference |
| `/inspect` | Turn-by-turn narrative of a live session with anomaly detection |

MCP server auto-discovered via `.mcp.json` (runs `uv run agentevals mcp`). Requires `agentevals serve` to be running for session-dependent tools (`list_sessions`, `summarize_session`, `evaluate_sessions`).

---

## 4-layer agentic infrastructure context

This repo sits in the **Evaluation and Reliability** layer of the agentic infrastructure suite:

| Layer | Solution | Problem solved |
|---|---|---|
| Compute | kAgent | Agent runtime, lifecycle, LLM calls |
| Connectivity | Agent Gateway | Routing, auth, protocol handling (MCP, A2A) |
| Governance | Agent Registry | Discovery, versioning, compliance |
| **Evaluation** | **agentevals** | **Regression detection, benchmarking, trust** |

agentevals consumes OTel traces produced by kAgent (via the Connectivity layer). The Agent Registry is visible in the cluster — the USGS MCP was deployed from it (annotation `aregistry.ai/deployment-id` on the `MCPServer` CRD).
