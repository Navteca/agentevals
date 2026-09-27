# agentevals Codebase Guide

This document explains what `agentevals` does, how it works, how the repository is organized, how scoring works, what interfaces it exposes, what is validated by tests, and where its main limitations are.

It is written from the code in this repository, not just from the README. Where possible, it points to the source-of-truth modules that implement each behavior.

## Executive Summary

`agentevals` is a local-first evaluation platform for AI agents. Its core idea is:

1. ingest existing OpenTelemetry traces from an agent run,
2. convert those traces into normalized agent invocations,
3. compare the observed behavior against expected behavior,
4. report scores, pass/fail status, and trace-level diagnostics.

The key product claim is real in the codebase: it evaluates from traces rather than by re-running the agent. The entire backend is built around converting traces into `Invocation` objects and then delegating scoring to Google ADK evaluators or custom evaluator backends.

The application is not just a CLI. It is a multi-surface product with:

- a CLI for local and CI usage,
- a FastAPI backend,
- OTLP HTTP and gRPC receivers,
- a live developer workflow based on WebSocket ingestion and SSE UI updates,
- a React UI for upload, inspection, eval-set building, and live monitoring,
- an MCP server that exposes evaluation functions to MCP clients.

## What the Application Actually Does

At a high level, the backend has five stages:

1. **Load traces**
   - Supported file loaders are Jaeger JSON and OTLP JSON/JSONL.
   - Live ingestion also accepts OTLP over HTTP and gRPC.

2. **Normalize traces**
   - Incoming spans are normalized into the internal `Span` and `Trace` dataclasses.
   - OTLP event attributes like `gen_ai.input.messages` can be promoted from span events into span attributes for compatibility.

3. **Convert traces into invocations**
   - The code auto-detects whether a trace is Google ADK-native or standard GenAI semantic-convention style.
   - The output of conversion is a list of ADK `Invocation` objects with:
     - user content,
     - final response,
     - tool calls,
     - tool responses,
     - timestamps.

4. **Run evaluators**
   - Built-in evaluators are mostly Google ADK metrics.
   - Custom evaluators can run as local Python/Node subprocesses.
   - There is also a dedicated backend for OpenAI Evals API grading.

5. **Report results**
   - Results are exposed through CLI output, JSON APIs, streaming SSE progress, the web UI, and MCP tools.

Primary implementation files:

- `src/agentevals/runner.py`
- `src/agentevals/converter.py`
- `src/agentevals/genai_converter.py`
- `src/agentevals/extraction.py`
- `src/agentevals/builtin_metrics.py`
- `src/agentevals/custom_evaluators.py`

## Core Product Value

The repository is optimized around a few concrete benefits.

### 1. No agent re-execution

This is the most important architectural choice. The system scores traces that already exist. The evaluation path starts from saved files or streamed telemetry, not from invoking an agent implementation again.

That reduces:

- token spend,
- runtime cost,
- nondeterminism caused by re-running LLM calls,
- friction in CI.

### 2. Framework-agnostic ingestion

The backend does not require one specific agent framework. It supports:

- Google ADK-native traces,
- generic OTel GenAI semantic-convention traces,
- OTLP logs-based content delivery,
- span-event-based content delivery for older or legacy instrumentations.

This is implemented in:

- `src/agentevals/extraction.py`
- `src/agentevals/converter.py`
- `src/agentevals/genai_converter.py`
- `src/agentevals/loader/otlp.py`
- `src/agentevals/api/otlp_processing.py`

### 3. Multiple ways to define “good”

The system supports several evaluation styles:

- exact or flexible tool-trajectory matching,
- lexical response similarity,
- LLM-judge response comparison,
- hallucination and safety checks,
- custom code-based evaluators,
- OpenAI Evals API grading,
- eval-set generation from golden sessions.

### 4. Local-first developer workflow

The app is intentionally usable without a hosted service:

- local CLI,
- local API server,
- in-memory live sessions,
- browser UI,
- no required database.

That makes iteration fast, but also creates some limitations discussed later.

## Repository Structure

The repo is split into a few meaningful layers.

### Backend runtime

- `src/agentevals/cli.py`
  - CLI entry point and server startup.
- `src/agentevals/runner.py`
  - Main orchestration for evaluation runs.
- `src/agentevals/config.py`
  - Pydantic config models for runs and evaluators.
- `src/agentevals/eval_config_loader.py`
  - YAML config loading and CLI/file config merge logic.

### Trace ingestion and conversion

- `src/agentevals/loader/`
  - File loaders for Jaeger JSON and OTLP JSON.
- `src/agentevals/converter.py`
  - Format detection and ADK trace conversion entrypoint.
- `src/agentevals/genai_converter.py`
  - GenAI semantic-convention trace conversion.
- `src/agentevals/extraction.py`
  - Shared extraction logic from flat span attributes.
- `src/agentevals/trace_metrics.py`
  - Performance and metadata extraction.

### Evaluation backends

- `src/agentevals/builtin_metrics.py`
  - Built-in metric wiring to ADK evaluators.
- `src/agentevals/custom_evaluators.py`
  - External evaluator protocol and local subprocess execution.
- `src/agentevals/openai_eval_backend.py`
  - OpenAI Evals API integration.
- `src/agentevals/evaluator/`
  - Templates, resolver, venv setup, evaluator sources.

### API and live streaming

- `src/agentevals/api/app.py`
  - Main FastAPI app assembly, CORS, UI hosting, SSE endpoint, WebSocket route.
- `src/agentevals/api/routes.py`
  - Main REST endpoints for health, config, conversion, validation, evaluation.
- `src/agentevals/api/streaming_routes.py`
  - Session listing, eval-set creation from sessions, live-session evaluation helpers.
- `src/agentevals/api/otlp_routes.py`
  - OTLP HTTP receiver.
- `src/agentevals/api/otlp_grpc.py`
  - OTLP gRPC receiver.
- `src/agentevals/streaming/ws_server.py`
  - In-memory live session manager and WebSocket session lifecycle.
- `src/agentevals/streaming/processor.py`
  - OTel processors that stream spans and logs over WebSocket.
- `src/agentevals/sdk.py`
  - High-level Python SDK for instrumented local development.

### Frontend

- `ui/src/App.tsx`
  - Top-level view switcher.
- `ui/src/context/TraceProvider.tsx`
  - Central client state and actions.
- `ui/src/api/client.ts`
  - Browser API client.
- `ui/src/components/upload/`
  - Offline evaluation workflow.
- `ui/src/components/dashboard/`
  - Results dashboard and metrics table.
- `ui/src/components/inspector/`
  - Detailed trace/metric inspection.
- `ui/src/components/streaming/`
  - Live session view.
- `ui/src/components/builder/`
  - Eval-set builder.
- `ui/src/components/annotation-queue/`
  - Manual review and queueing workflow.

### Examples, tests, deployment

- `examples/`
  - Zero-code OTLP and SDK examples.
- `tests/`
  - Unit tests.
- `tests/integration/`
  - OTLP/session/evaluation integration tests.
- `charts/agentevals/`
  - Helm chart.
- `Dockerfile`
  - Container image build.

## Main Execution Flows

## 1. Offline CLI or API evaluation flow

The path is:

1. load traces with `get_loader()` in `runner.py`,
2. convert all traces with `convert_traces()`,
3. optionally load an eval set with `EvalSet.model_validate()`,
4. extract trace performance metadata,
5. evaluate each converted trace concurrently,
6. emit aggregate and per-trace results.

Important implementation details:

- Trace concurrency is limited by `max_concurrent_traces`.
- Metric concurrency is limited by `max_concurrent_evals`.
- Failures in one trace do not stop evaluation of other traces.
- If no invocations are extracted, the trace gets an explicit error result.

Source:

- `src/agentevals/runner.py`

## 2. Live OTLP ingestion flow

For zero-code integrations, agents send OTLP data directly to OTLP receiver surfaces started by `agentevals serve`.

Important architecture note:

- OTLP HTTP ingestion is handled by dedicated OTLP app wiring in `src/agentevals/api/otlp_app.py`
- OTLP gRPC ingestion is handled by dedicated server wiring in `src/agentevals/api/otlp_grpc.py`
- those receivers share downstream processing/session logic with main API app, but OTLP ingestion is not just a normal route on the main FastAPI UI/API app

Flow:

1. `/v1/traces` or `/v1/logs` receives OTLP payloads.
2. Payloads are decoded and normalized.
3. Session metadata is extracted from resource attributes.
4. The `StreamingTraceManager` either creates or reuses a session.
5. Spans and logs are appended to the session.
6. Incremental extraction emits live UI updates.
7. When a session completes, full invocation extraction runs.
8. The UI receives `session_complete` over SSE.

Notable behaviors:

- sessions are grouped primarily by `agentevals.session_name`,
- a single logical session can contain multiple trace IDs,
- logs that arrive before spans are buffered as orphan logs,
- completed sessions can be reopened only when late telemetry matches existing session identity logic, mainly via known `conversation_id` / active `session_name` or already-known `trace_id`,
- sessions are kept in memory only.

Sources:

- `src/agentevals/api/otlp_routes.py`
- `src/agentevals/api/otlp_processing.py`
- `src/agentevals/streaming/ws_server.py`

## 3. SDK live-development flow

The Python SDK wraps WebSocket streaming and OTel setup for developers who want explicit session control.

Flow:

1. `AgentEvals.session()` or `session_async()` creates a streaming processor.
2. It connects to `ws://localhost:8001/ws/traces` by default.
3. It adds the span processor to the active `TracerProvider`.
4. If OpenAI OTel instrumentation is installed, it may also set up a `LoggerProvider` and log processor.
5. During the session, completed spans and correlated logs are streamed to the server.
6. On exit, providers are flushed and the processor is shut down.

Important caveat:

- OTel has no processor removal API, so processors remain attached to the provider after shutdown, though the code treats the processor as inert afterward.

Source:

- `src/agentevals/sdk.py`

## Trace Formats and Conversion Logic

The project supports two main trace families.

### ADK-native traces

Detection:

- spans with `otel.scope.name == "gcp.vertex.agent"`

Conversion strategy:

- find `invoke_agent` spans,
- find child `call_llm` spans,
- extract first user message and last model response,
- extract `execute_tool` spans into tool calls and tool responses,
- build ADK `Invocation` objects.

Source:

- `src/agentevals/converter.py`

### GenAI semantic-convention traces

Detection:

- `gen_ai.request.model`,
- `gen_ai.input.messages`,
- no broader generic marker set beyond those checks in extractor detection path.

Conversion strategy:

- identify invocation spans or fall back to root spans,
- extract user and assistant text from enriched message attributes,
- detect tool calls from tool spans or model messages,
- recover tool responses from tool spans; model-message fallback adds tool calls but not tool responses,
- handle multi-turn conversations when multiple root LLM spans represent one conversation history,
- deduplicate repeated invocations caused by tool-use loops.

Source:

- `src/agentevals/genai_converter.py`

### Message content compatibility strategy

The code supports three delivery mechanisms for GenAI message content:

- direct span attributes,
- correlated OTel logs,
- span events promoted into attributes.

That compatibility story is one of the stronger technical aspects of the codebase. It lets the product handle real-world instrumentation differences instead of assuming one clean telemetry format.

## How Scoring Works

Scoring is centered on ADK `Invocation` objects, not raw spans. That matters because every metric operates on normalized user messages, final responses, and tool trajectories.

## Expected vs actual behavior

The runner computes:

- `actual_invocations` from the observed trace,
- `expected_invocations` from the eval set, if present.

Matching expected invocations works like this:

1. if the eval set has one case, use it,
2. otherwise compare the first user message of the actual trace to the first user message of each eval case,
3. matching is exact after lowercase/trim normalization,
4. if nothing matches, fall back to the first eval case.

This is simple and pragmatic, but it is also one of the main accuracy limits for multi-case eval sets.

Source:

- `src/agentevals/runner.py`

## Built-in metrics

Built-in metrics are delegated to Google ADK evaluators. `agentevals` mainly handles wiring, thresholds, required inputs, and result shaping.

Implemented metric handling in code includes:

- `tool_trajectory_avg_score`
- `response_match_score`
- `response_evaluation_score`
- `final_response_match_v2`
- `hallucinations_v1`
- `safety_v1`
- `rubric_based_final_response_quality_v1`
- `rubric_based_tool_use_quality_v1`
- `per_turn_user_simulator_quality_v1`

Notes:

- `per_turn_user_simulator_quality_v1` is wired in backend metric code but intentionally omitted from `/api/metrics`, so API/UI clients do not see it as normal selectable metric,
- the UI/API marks rubric-based metrics as not currently working,
- rubric-based built-in metrics are more limited than that label suggests: normal runner/API path does not pass rubric config into built-in metric construction, so those metrics are not meaningfully configurable through standard evaluation flow,
- some metrics need an eval set,
- some metrics need an LLM judge,
- some metrics need GCP/Vertex AI credentials.

Source:

- `src/agentevals/builtin_metrics.py`
- `src/agentevals/api/routes.py`

## Metric-by-metric meaning

### `tool_trajectory_avg_score`

What it measures:

- whether the observed tool calls match the expected tool calls.

Match modes:

- `EXACT`
- `IN_ORDER`
- `ANY_ORDER`

Strengths:

- deterministic,
- cheap,
- very interpretable,
- good for gating regressions in tool behavior.

Weaknesses:

- only as good as extracted tool calls,
- sensitive to argument mismatches,
- does not judge whether the final answer was good.

Special detail:

- `agentevals` adds detailed expected-vs-actual comparisons to the metric result for inspection.

### `response_match_score`

What it measures:

- lexical similarity between actual and expected final response.

In practice:

- this is delegated to ADK and described in repo docs/API as ROUGE-style response matching.

Strengths:

- deterministic,
- cheap,
- useful for templated or stable outputs.

Weaknesses:

- surface-form based,
- weak when multiple semantically-correct phrasings are possible.

### `final_response_match_v2`

What it measures:

- LLM-judge comparison between actual and expected final responses.

Strengths:

- better than lexical similarity for semantic equivalence.

Weaknesses:

- more expensive,
- nondeterministic,
- dependent on model choice and API availability.

### `response_evaluation_score`

What it measures:

- semantic response quality via Vertex AI-backed ADK evaluation.

Constraint:

- requires GCP/Vertex setup.

### `hallucinations_v1`

What it measures:

- whether the response contains hallucinated content, using an LLM judge.

### `safety_v1`

What it measures:

- safety assessment via Vertex AI-backed ADK evaluation.

## Custom evaluator system

This is one of the more extensible parts of the codebase.

### Protocol

Custom evaluators consume JSON on stdin and emit JSON on stdout using the internal protocol types in:

- `src/agentevals/_protocol.py`
- `packages/evaluator-sdk-py/src/agentevals_evaluator_sdk/`

Each evaluator receives:

- metric name,
- threshold,
- config,
- actual invocations,
- expected invocations,
- performance metrics.

Each evaluator returns:

- score,
- optional status,
- optional per-invocation scores,
- optional details.

### Execution model

Currently implemented backends:

- local subprocess execution for `.py`, `.js`, `.ts`
- OpenAI Evals API backend

Planned but not implemented yet:

- richer executor environments like Docker are hinted at in config comments, but not implemented in the shipped factory map.

### Runtime management

For Python evaluators, the code can create a per-evaluator virtual environment automatically through `evaluator/venv.py`, which improves portability of custom evaluator dependencies.

Sources:

- `src/agentevals/custom_evaluators.py`
- `src/agentevals/openai_eval_backend.py`
- `src/agentevals/evaluator/venv.py`

## How Accurate Is This Application?

The honest answer is: accuracy depends on what exactly you ask it to score.

## Where it is strongest

### Strongest area: structural evaluation

`tool_trajectory_avg_score` is likely the most reliable metric in the product because it is:

- deterministic,
- explainable,
- trace-derived,
- not dependent on another LLM’s judgment.

If the traces correctly capture tool usage, this metric is a solid regression detector.

### Also strong: extraction and telemetry compatibility

The backend has substantial logic for:

- handling ADK and GenAI traces,
- merging logs into spans,
- promoting event-based message content,
- grouping multi-trace sessions,
- recovering from out-of-order telemetry arrival.

That makes ingestion accuracy better than a simple trace parser.

## Where accuracy is weaker

### Multi-case eval-set matching is simplistic

When an eval set has multiple cases, case selection is based on exact match of the first user message after trim/lowercase normalization. If there is no match, the code silently falls back to the first eval case.

This can create false comparisons in realistic test suites with paraphrases or similar prompts.

Source:

- `src/agentevals/runner.py`

### LLM-judge metrics are inherently variable

Metrics like `final_response_match_v2` and `hallucinations_v1` depend on external judge models. They are useful, but they are not deterministic in the same way as trajectory checks.

### Response lexical matching can misjudge semantically-correct answers

Lexical similarity is not semantic equivalence. `response_match_score` is useful for stable expected outputs, but weaker for open-ended responses.

### Accuracy depends on trace completeness

If instrumentation fails to capture:

- message content,
- tool calls,
- tool results,
- logs correlated to spans,

then conversion quality drops and every downstream metric becomes less trustworthy.

The code explicitly warns about missing GenAI messages in some cases.

Source:

- `src/agentevals/genai_converter.py`

## Is the Codebase Well-Validated?

Mostly yes, within its intended scope.

### What was verified during this review

I ran the non-integration test suite locally:

- `387` tests passed
- command used: `uv run pytest tests/ --ignore=tests/integration`

I also ran the integration suite that exercises the OTLP/session pipeline:

- `29` integration tests passed, `15` were deselected by marker filtering
- command used: `uv run pytest tests/integration/ -m "integration and not e2e" -v`

That provides strong evidence that the main local business logic and live OTLP session behavior are covered.

### What the tests cover well

- API contracts and response envelopes
- loader behavior
- trace conversion
- extraction helpers
- OTLP receiver normalization and session management
- custom protocol types
- runner behavior
- SDK lifecycle behavior
- MCP server behavior
- session grouping and orphan-log handling
- split-batch reopening and timing edge cases

Representative test files:

- `tests/test_runner.py`
- `tests/test_converter.py`
- `tests/test_genai_converter.py`
- `tests/test_otlp_receiver.py`
- `tests/test_api.py`
- `tests/test_sdk.py`
- `tests/integration/test_session_grouping.py`
- `tests/integration/test_timing_stress.py`

### What remains less directly validated in this review

The remaining unrun tests are mainly the e2e/live-agent path, which improves confidence in:

- full live-agent workflows with real providers,
- external API-key-backed integrations,
- real subprocess/server boundaries.

## Interfaces and Options the Application Offers

## CLI

Main commands include:

- `agentevals run`
- `agentevals serve`
- `agentevals evaluator init`
- `agentevals evaluator list`
- `agentevals evaluator runtimes`
- `agentevals evaluator config`
- `agentevals mcp`

Important run options:

- trace files
- eval set file
- one or more metrics
- trace format
- judge model
- threshold
- trajectory match type
- output format
- YAML config file

Source:

- `src/agentevals/cli.py`

## REST API

Implemented endpoints include:

- `GET /api/health`
- `GET /api/config`
- `GET /api/metrics`
- `POST /api/validate/eval-set`
- `POST /api/convert`
- `POST /api/evaluate`
- `POST /api/evaluate/stream`

Streaming/session endpoints:

- `GET /api/streaming/sessions`
- `POST /api/streaming/create-eval-set`
- `POST /api/streaming/evaluate-sessions`
- `POST /api/streaming/prepare-evaluation`
- `GET /api/streaming/download/{filename}`
- `POST /api/streaming/get-trace`

OTLP ingestion endpoints:

- `POST /v1/traces`
- `POST /v1/logs`

Source:

- `src/agentevals/api/routes.py`
- `src/agentevals/api/streaming_routes.py`
- `src/agentevals/api/otlp_app.py`
- `src/agentevals/api/otlp_grpc.py`
- `src/agentevals/api/otlp_routes.py`

## Web UI

The UI has several user-facing modes.

### Welcome view

Entry points:

- local live development,
- offline evaluations,
- eval-set builder.

### Upload/offline evaluation flow

Features:

- upload trace files,
- upload or edit eval sets,
- select metrics,
- choose judge model,
- choose threshold,
- choose trajectory match mode,
- run streaming evaluation and watch progress.

### Dashboard

Features:

- trace-level results table,
- summary statistics,
- performance charts,
- error display,
- navigation into inspector.

### Inspector

Features:

- per-trace details,
- metric result breakdowns,
- trajectory comparisons,
- invocation-level summaries.

### Live streaming view

Features:

- SSE-driven live session list,
- incremental user/tool/agent conversation rendering,
- token counters,
- selection of golden sessions,
- queueing sessions for later review/evaluation.

### Eval-set builder

Features:

- build an eval set from uploaded traces,
- edit metadata and eval cases,
- preview generated JSON,
- validate before saving.

### Annotation queue

Features:

- curate live sessions,
- attach manual annotations,
- select a golden session,
- transfer sessions into the offline evaluation workflow.

Sources:

- `ui/src/App.tsx`
- `ui/src/context/TraceProvider.tsx`
- `ui/src/components/upload/UploadView.tsx`
- `ui/src/components/dashboard/DashboardView.tsx`
- `ui/src/components/streaming/LiveStreamingView.tsx`
- `ui/src/components/builder/BuilderView.tsx`
- `ui/src/components/annotation-queue/AnnotationQueueView.tsx`

## MCP Server

The MCP server wraps backend API functionality into MCP tools. It exposes capabilities like:

- metric listing,
- trace evaluation,
- session summarization,
- session evaluation against a golden baseline.

This is useful if the user wants to run evaluations from an MCP-capable assistant or IDE workflow rather than manually through CLI/UI.

Source:

- `src/agentevals/mcp_server.py`

## Live Session Architecture

The live subsystem is in-memory and session-centric.

### Session model

A session stores:

- session ID,
- primary trace ID,
- set of trace IDs,
- spans,
- logs,
- extracted invocations,
- metadata,
- completion state,
- timing data.

### Completion logic

A session completes in one of two ways:

- root span arrival starts a grace-period completion timer,
- or an idle timeout completes the session if no more telemetry arrives.

### Cleanup logic

Sessions are cleaned up by:

- TTL for completed sessions,
- max session count enforcement.

Default limits in code/docs:

- completed sessions kept for 2 hours,
- max 100 sessions,
- per-session limits on spans and logs.

This is a pragmatic design for local development, not durable storage.

Source:

- `src/agentevals/streaming/ws_server.py`
- `src/agentevals/streaming/session.py`

## Performance and Metadata Reporting

The product does more than quality scoring. It also extracts operational metrics from traces:

- overall latency percentiles,
- LLM latency percentiles,
- tool execution latency percentiles,
- prompt/output/total tokens,
- cache token counters when available,
- agent/model/provider metadata,
- user input and final output previews.

These values are shown in the API/UI and are useful for comparing model versions or agent implementations beyond pass/fail quality.

Source:

- `src/agentevals/trace_metrics.py`

## Deployment and Packaging

## Python package

The package version in this repo is `0.5.2` in `pyproject.toml`.

Optional dependency groups:

- `live`
- `streaming`
- `openai`

Notable base dependencies:

- Google ADK eval support
- FastAPI
- Uvicorn
- OTLP proto support
- PyYAML
- `httpx`

## Docker

The Docker image:

- builds the UI first with Node,
- copies built UI assets into `src/agentevals/_static`,
- installs Python dependencies with `uv`,
- exposes ports for API/UI, OTLP HTTP, OTLP gRPC, and MCP.

Source:

- `Dockerfile`

## Helm

The Helm chart deploys:

- HTTP API/UI port,
- OTLP HTTP receiver,
- OTLP gRPC receiver,
- MCP port,
- health probes,
- optional ephemeral volume configuration.

Source:

- `charts/agentevals/templates/deployment.yaml`
- `charts/agentevals/values.yaml`

## Current Limitations and Gaps

These are the most important non-marketing realities visible in the code.

### 1. Session storage is in-memory only

There is no persistent database for live sessions. If the process restarts, sessions are gone.

### 2. Eval-case matching for multi-case eval sets is fragile

Exact first-user-message matching is easy to understand but not robust for paraphrases.

### 3. Some metric surface area is ahead of full UX support

Rubric-based metrics appear in the API metadata, but the API marks them as not working.

### 4. Some planned extensibility is not yet implemented

Executor configuration suggests future Docker-style execution backends, but the shipped factory only supports local subprocess execution.

### 5. Live UI has some unfinished areas

`comparison` is explicitly a placeholder in `ui/src/App.tsx`.

### 6. File upload limits are intentionally conservative

The API enforces a 10 MB limit per uploaded trace/eval-set file.

### 7. Accuracy is gated by telemetry quality

If the upstream instrumentation does not emit enough message/tool information, the product cannot fully reconstruct the conversation.

## What Is Especially Good About the Codebase

From an engineering standpoint, the strongest parts are:

- clear separation between ingestion, conversion, evaluation, and presentation,
- pragmatic support for real OTel compatibility edge cases,
- good test coverage for core logic,
- multiple user surfaces built on the same evaluation engine,
- maintainable internal data flow centered on normalized invocations.

## What Is Most Likely To Need Improvement Over Time

- more robust eval-case selection,
- persistent session storage,
- richer evaluator executors,
- clearer metric capability negotiation,
- stronger support for semantic equivalence without LLM variability,
- more polished completion of UI features like comparison workflows.

## How To Update This Document

If the codebase changes, update this file by checking these source-of-truth files first.

### Product surfaces and startup

- `README.md`
- `src/agentevals/cli.py`
- `src/agentevals/api/app.py`

### Evaluation engine

- `src/agentevals/runner.py`
- `src/agentevals/builtin_metrics.py`
- `src/agentevals/custom_evaluators.py`
- `src/agentevals/openai_eval_backend.py`

### Trace ingestion and conversion

- `src/agentevals/converter.py`
- `src/agentevals/genai_converter.py`
- `src/agentevals/extraction.py`
- `src/agentevals/loader/`
- `src/agentevals/api/otlp_processing.py`

### Live mode

- `src/agentevals/streaming/ws_server.py`
- `src/agentevals/streaming/processor.py`
- `src/agentevals/api/streaming_routes.py`
- `src/agentevals/sdk.py`

### Frontend product capabilities

- `ui/src/App.tsx`
- `ui/src/context/TraceProvider.tsx`
- `ui/src/components/`

### Validation status

Re-run at least:

```bash
uv run pytest tests/ --ignore=tests/integration
```

And when possible also run:

```bash
uv run pytest tests/integration/ -m "integration and not e2e" -v
```

## Bottom Line

`agentevals` is a trace-first agent evaluation system with a stronger implementation than a simple demo. Its best use case is deterministic or semi-deterministic regression testing of agent behavior, especially tool-use behavior, without re-running the agent.

It is most trustworthy when:

- traces are complete,
- eval sets are well-curated,
- tool trajectories matter,
- you understand the difference between deterministic metrics and judge-based metrics.

It is less trustworthy as a universal “ground truth” quality oracle for open-ended agent behavior. The code does not support that claim, and the architecture is better understood as a practical evaluation workbench than as a perfect agent judge.
