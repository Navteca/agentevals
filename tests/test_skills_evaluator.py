"""Tests for the skills_trajectory_v1 evaluator."""

import asyncio
import json

import pytest

from agentevals.builtin_metrics import (
    METRICS_SKILLS_TRAJECTORY,
    _evaluate_skills_trajectory,
    _skills_score,
    evaluate_builtin_metric,
)
from agentevals.config import EvalRunConfig
from agentevals.converter import convert_traces
from agentevals.loader.base import Span, Trace
from agentevals.runner import _evaluate_trace, run_evaluation


def _make_trace(tools: list[str], trace_id: str = "t1") -> Trace:
    """Minimal ADK trace calling the given tools."""
    invoke = Span(
        trace_id=trace_id,
        span_id="invoke1",
        parent_span_id=None,
        operation_name="invoke_agent test_agent",
        start_time=1000,
        duration=10000,
        tags={"otel.scope.name": "gcp.vertex.agent"},
    )
    llm = Span(
        trace_id=trace_id,
        span_id="llm1",
        parent_span_id="invoke1",
        operation_name="call_llm",
        start_time=2000,
        duration=1000,
        tags={
            "otel.scope.name": "gcp.vertex.agent",
            "gcp.vertex.agent.llm_request": json.dumps(
                {"contents": [{"role": "user", "parts": [{"text": "do something"}]}]}
            ),
        },
    )
    tool_spans = [
        Span(
            trace_id=trace_id,
            span_id=f"tool{i}",
            parent_span_id="invoke1",
            operation_name=f"execute_tool {name}",
            start_time=3000 + i * 100,
            duration=100,
            tags={"otel.scope.name": "gcp.vertex.agent"},
        )
        for i, name in enumerate(tools)
    ]
    llm_resp = Span(
        trace_id=trace_id,
        span_id="llm2",
        parent_span_id="invoke1",
        operation_name="call_llm",
        start_time=5000,
        duration=1000,
        tags={
            "otel.scope.name": "gcp.vertex.agent",
            "gcp.vertex.agent.llm_response": json.dumps({"content": {"role": "model", "parts": [{"text": "done"}]}}),
        },
    )
    invoke.children = [llm, *tool_spans, llm_resp]
    return Trace(
        trace_id=trace_id,
        root_spans=[invoke],
        all_spans=[invoke, llm, *tool_spans, llm_resp],
    )


# ── Unit tests: _skills_score ────────────────────────────────────────────────


class TestSkillsScore:
    def test_all_present_any_order(self):
        assert _skills_score(["a", "b"], ["b", "a"], order_matters=False) == 1.0

    def test_partial_match(self):
        assert _skills_score(["a", "b", "c"], ["a", "c"], order_matters=False) == pytest.approx(2 / 3)

    def test_none_present(self):
        assert _skills_score(["x", "y"], ["a", "b"], order_matters=False) == 0.0

    def test_empty_required(self):
        assert _skills_score([], ["a", "b"], order_matters=False) == 1.0

    def test_in_order_pass(self):
        assert _skills_score(["a", "b"], ["a", "x", "b"], order_matters=True) == 1.0

    def test_in_order_fail_wrong_order(self):
        assert _skills_score(["a", "b"], ["b", "a"], order_matters=True) == pytest.approx(0.5)

    def test_in_order_partial(self):
        # required ["a","b","c"], called ["a","c"]
        # a found at pos 0, b not found, c not found after b's position → 1/3
        assert _skills_score(["a", "b", "c"], ["a", "c"], order_matters=True) == pytest.approx(1 / 3)

    def test_extra_calls_ignored(self):
        assert _skills_score(["a"], ["x", "a", "y"], order_matters=False) == 1.0


# ── Unit tests: _evaluate_skills_trajectory ──────────────────────────────────


class TestEvaluateSkillsTrajectory:
    def _invocations(self, tools: list[str]):
        trace = _make_trace(tools)
        return convert_traces([trace])[0].invocations

    def test_all_skills_found_passes(self):
        invs = self._invocations(["search", "summarize"])
        result = _evaluate_skills_trajectory(invs, ["search", "summarize"], None, 0.5)
        assert result.score == 1.0
        assert result.eval_status == "PASSED"

    def test_no_skills_found_fails(self):
        invs = self._invocations(["other_tool"])
        result = _evaluate_skills_trajectory(invs, ["search"], None, 0.5)
        assert result.score == 0.0
        assert result.eval_status == "FAILED"

    def test_partial_score(self):
        invs = self._invocations(["search"])
        result = _evaluate_skills_trajectory(invs, ["search", "summarize"], None, 0.6)
        assert result.score == pytest.approx(0.5)
        assert result.eval_status == "FAILED"

    def test_in_order_pass(self):
        invs = self._invocations(["fetch", "parse"])
        result = _evaluate_skills_trajectory(invs, ["fetch", "parse"], "IN_ORDER", 0.5)
        assert result.score == 1.0
        assert result.eval_status == "PASSED"

    def test_in_order_fail(self):
        invs = self._invocations(["parse", "fetch"])
        result = _evaluate_skills_trajectory(invs, ["fetch", "parse"], "IN_ORDER", 0.8)
        assert result.score == pytest.approx(0.5)
        assert result.eval_status == "FAILED"

    def test_empty_skills_returns_error(self):
        invs = self._invocations(["tool"])
        result = _evaluate_skills_trajectory(invs, [], None, 0.5)
        assert result.error is not None
        assert result.score is None

    def test_details_populated(self):
        invs = self._invocations(["a", "b"])
        result = _evaluate_skills_trajectory(invs, ["a"], None, 0.5)
        assert result.details is not None
        assert "comparisons" in result.details
        comp = result.details["comparisons"][0]
        assert comp["required_skills"] == ["a"]
        assert "a" in comp["called_tools"]

    def test_threshold_respected(self):
        invs = self._invocations(["a", "b"])
        result = _evaluate_skills_trajectory(invs, ["a", "b", "c"], None, threshold=0.9)
        assert result.score == pytest.approx(2 / 3)
        assert result.eval_status == "FAILED"


# ── Integration tests: evaluate_builtin_metric ───────────────────────────────


class TestEvaluateBuiltinMetricSkills:
    def _invocations(self, tools: list[str]):
        return convert_traces([_make_trace(tools)])[0].invocations

    def test_dispatches_to_skills_evaluator(self):
        invs = self._invocations(["geocode", "weather"])
        result = asyncio.run(
            evaluate_builtin_metric(
                metric_name=METRICS_SKILLS_TRAJECTORY,
                actual_invocations=invs,
                expected_invocations=None,
                judge_model=None,
                threshold=0.5,
                skills=["geocode", "weather"],
            )
        )
        assert result.score == 1.0
        assert result.eval_status == "PASSED"
        assert result.metric_name == METRICS_SKILLS_TRAJECTORY

    def test_missing_skills_returns_error(self):
        invs = self._invocations(["geocode"])
        result = asyncio.run(
            evaluate_builtin_metric(
                metric_name=METRICS_SKILLS_TRAJECTORY,
                actual_invocations=invs,
                expected_invocations=None,
                judge_model=None,
                threshold=0.5,
                skills=[],
            )
        )
        assert result.error is not None


# ── Integration tests: run_evaluation ────────────────────────────────────────


class TestRunEvaluationSkills:
    def test_run_evaluation_skills_pass(self, tmp_path):
        trace_file = tmp_path / "trace.json"
        trace = _make_trace(["skill_a", "skill_b"])
        import json as _json

        from agentevals.loader.jaeger import JaegerJsonLoader

        # Serialize via JaegerJsonLoader round-trip isn't available; use converter + write raw
        # Instead write a minimal jaeger trace file
        jaeger = {
            "data": [
                {
                    "traceID": "t1",
                    "spans": [
                        {
                            "traceID": "t1",
                            "spanID": "invoke1",
                            "operationName": "invoke_agent test_agent",
                            "references": [],
                            "startTime": 1000000,
                            "duration": 10000000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t1",
                            "spanID": "llm1",
                            "operationName": "call_llm",
                            "references": [{"refType": "CHILD_OF", "traceID": "t1", "spanID": "invoke1"}],
                            "startTime": 2000000,
                            "duration": 1000000,
                            "tags": [
                                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                                {
                                    "key": "gcp.vertex.agent.llm_request",
                                    "type": "string",
                                    "value": _json.dumps(
                                        {"contents": [{"role": "user", "parts": [{"text": "do something"}]}]}
                                    ),
                                },
                            ],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t1",
                            "spanID": "tool0",
                            "operationName": "execute_tool skill_a",
                            "references": [{"refType": "CHILD_OF", "traceID": "t1", "spanID": "invoke1"}],
                            "startTime": 3000000,
                            "duration": 100000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t1",
                            "spanID": "tool1",
                            "operationName": "execute_tool skill_b",
                            "references": [{"refType": "CHILD_OF", "traceID": "t1", "spanID": "invoke1"}],
                            "startTime": 3100000,
                            "duration": 100000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t1",
                            "spanID": "llm2",
                            "operationName": "call_llm",
                            "references": [{"refType": "CHILD_OF", "traceID": "t1", "spanID": "invoke1"}],
                            "startTime": 5000000,
                            "duration": 1000000,
                            "tags": [
                                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                                {
                                    "key": "gcp.vertex.agent.llm_response",
                                    "type": "string",
                                    "value": _json.dumps({"content": {"role": "model", "parts": [{"text": "done"}]}}),
                                },
                            ],
                            "logs": [],
                            "processID": "p1",
                        },
                    ],
                    "processes": {"p1": {"serviceName": "test_agent", "tags": []}},
                }
            ]
        }
        trace_file.write_text(_json.dumps(jaeger))

        config = EvalRunConfig(
            trace_files=[str(trace_file)],
            metrics=[METRICS_SKILLS_TRAJECTORY],
            skills_trajectory_skills=["skill_a", "skill_b"],
        )
        result = asyncio.run(run_evaluation(config))

        assert len(result.errors) == 0
        mr = result.trace_results[0].metric_results[0]
        assert mr.metric_name == METRICS_SKILLS_TRAJECTORY
        assert mr.score == 1.0
        assert mr.eval_status == "PASSED"
        assert mr.duration_ms is not None

    def test_run_evaluation_skills_in_order_fail(self, tmp_path):
        import json as _json

        jaeger = {
            "data": [
                {
                    "traceID": "t2",
                    "spans": [
                        {
                            "traceID": "t2",
                            "spanID": "invoke1",
                            "operationName": "invoke_agent test_agent",
                            "references": [],
                            "startTime": 1000000,
                            "duration": 10000000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t2",
                            "spanID": "llm1",
                            "operationName": "call_llm",
                            "references": [{"refType": "CHILD_OF", "traceID": "t2", "spanID": "invoke1"}],
                            "startTime": 2000000,
                            "duration": 1000000,
                            "tags": [
                                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                                {
                                    "key": "gcp.vertex.agent.llm_request",
                                    "type": "string",
                                    "value": _json.dumps({"contents": [{"role": "user", "parts": [{"text": "go"}]}]}),
                                },
                            ],
                            "logs": [],
                            "processID": "p1",
                        },
                        # skill_b called BEFORE skill_a — wrong order
                        {
                            "traceID": "t2",
                            "spanID": "tool0",
                            "operationName": "execute_tool skill_b",
                            "references": [{"refType": "CHILD_OF", "traceID": "t2", "spanID": "invoke1"}],
                            "startTime": 3000000,
                            "duration": 100000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t2",
                            "spanID": "tool1",
                            "operationName": "execute_tool skill_a",
                            "references": [{"refType": "CHILD_OF", "traceID": "t2", "spanID": "invoke1"}],
                            "startTime": 3100000,
                            "duration": 100000,
                            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
                            "logs": [],
                            "processID": "p1",
                        },
                        {
                            "traceID": "t2",
                            "spanID": "llm2",
                            "operationName": "call_llm",
                            "references": [{"refType": "CHILD_OF", "traceID": "t2", "spanID": "invoke1"}],
                            "startTime": 5000000,
                            "duration": 1000000,
                            "tags": [
                                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                                {
                                    "key": "gcp.vertex.agent.llm_response",
                                    "type": "string",
                                    "value": _json.dumps({"content": {"role": "model", "parts": [{"text": "done"}]}}),
                                },
                            ],
                            "logs": [],
                            "processID": "p1",
                        },
                    ],
                    "processes": {"p1": {"serviceName": "test_agent", "tags": []}},
                }
            ]
        }
        trace_file = tmp_path / "trace2.json"
        trace_file.write_text(_json.dumps(jaeger))

        config = EvalRunConfig(
            trace_files=[str(trace_file)],
            metrics=[METRICS_SKILLS_TRAJECTORY],
            skills_trajectory_skills=["skill_a", "skill_b"],
            skills_trajectory_match_type="IN_ORDER",
            threshold=0.8,
        )
        result = asyncio.run(run_evaluation(config))
        mr = result.trace_results[0].metric_results[0]
        assert mr.score < 1.0
        assert mr.eval_status == "FAILED"
