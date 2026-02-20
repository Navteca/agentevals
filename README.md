`trace-eval` is a standalone CLI tool that scores agent behavior from OpenTelemetry traces (Jaeger JSON format initially) without re-running the agent. It parses trace spans (`invoke_agent`, `call_llm`, `execute_tool`) and converts them into ADK's Invocation data structures while extracting user input, final response, tool calls, and tool responses.

Unlike adk-python's LocalEvalService, which couples agent execution with evaluation (it runs the agent and then scores), trace-eval only does the scoring half: it takes pre-recorded traces and feeds them directly to ADK's evaluator classes like TrajectoryEvaluator.

You provide a golden eval set (JSON following ADK's EvalSet schema) with expected tool calls/responses, and trace-eval compares actual vs expected using the same metrics ADK uses. It supports both lightweight metrics (e.g. trajectory matching) and we can add LLM-judge metrics (hallucinations, rubric-based quality)

Commands to try:

Score helm trace for correct tool usage

```console
uv run trace-eval run samples/helm.json --eval-set samples/eval_set_helm.json -m tool_trajectory_avg_score
```

```console
Trace: 3e289017fe03ffd7c4145316d2eb3d0d
Invocations: 1
        Metric                       Score  Status      Per-Invocation  Error
------  -------------------------  -------  --------  ----------------  -------
[PASS]  tool_trajectory_avg_score        1  PASSED                   1
```

Score multiple traces at once (helm passes, k8s fails since no matching golden data)

```console
uv run trace-eval run samples/helm.json samples/k8s.json --eval-set samples/eval_set_helm.json -m tool_trajectory_avg_score
```

```console
Trace: 3e289017fe03ffd7c4145316d2eb3d0d
Invocations: 1
        Metric                       Score  Status      Per-Invocation  Error
------  -------------------------  -------  --------  ----------------  -------
[PASS]  tool_trajectory_avg_score        1  PASSED                   1

Trace: d497c9dd55717f2c5ecb79bda3028993
Invocations: 1
        Metric                       Score  Status      Per-Invocation  Error
------  -------------------------  -------  --------  ----------------  -------
[FAIL]  tool_trajectory_avg_score        0  FAILED                   0
```

JSON output for programmatic consumption

```console
uv run trace-eval run samples/helm.json --eval-set samples/eval_set_helm.json -m tool_trajectory_avg_score --output json
```

```json
{
  "traces": [
    {
      "trace_id": "3e289017fe03ffd7c4145316d2eb3d0d",
      "num_invocations": 1,
      "conversion_warnings": [],
      "metrics": [
        {
          "metric_name": "tool_trajectory_avg_score",
          "score": 1.0,
          "eval_status": "PASSED",
          "per_invocation_scores": [
            1.0
          ],
          "error": null
        }
      ]
    }
  ],
  "errors": []
}
```

## Web UI

The React UI provides visual trace inspection and evaluation. It calls the Python backend via REST API for all evaluation logic.

**Start locally:**

```console
# Terminal 1: Start API server
uv run uvicorn trace_eval.api.app:app --reload --port 8000

# Terminal 2: Start UI
cd ui && npm run dev
```

Open http://localhost:5173, upload trace files and an eval set, select metrics, and run evaluation. The UI shows results in a dashboard with interactive trace inspection (span tree, invocations, actual vs expected comparisons).
