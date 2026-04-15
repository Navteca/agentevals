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
from agentevals.runner import _evaluate_trace, run_evaluation

from conftest import make_tool_trace


def _write_jaeger_trace(trace_file, tools: list[str], trace_id: str = "t1") -> None:
    spans = [
        {
            "traceID": trace_id,
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
            "traceID": trace_id,
            "spanID": "llm1",
            "operationName": "call_llm",
            "references": [{"refType": "CHILD_OF", "traceID": trace_id, "spanID": "invoke1"}],
            "startTime": 2000000,
            "duration": 1000000,
            "tags": [
                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                {
                    "key": "gcp.vertex.agent.llm_request",
                    "type": "string",
                    "value": json.dumps({"contents": [{"role": "user", "parts": [{"text": "do something"}]}]}),
                },
            ],
            "logs": [],
            "processID": "p1",
        },
    ]
    spans.extend(
        {
            "traceID": trace_id,
            "spanID": f"tool{i}",
            "operationName": f"execute_tool {name}",
            "references": [{"refType": "CHILD_OF", "traceID": trace_id, "spanID": "invoke1"}],
            "startTime": 3000000 + i * 100000,
            "duration": 100000,
            "tags": [{"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"}],
            "logs": [],
            "processID": "p1",
        }
        for i, name in enumerate(tools)
    )
    spans.append(
        {
            "traceID": trace_id,
            "spanID": "llm2",
            "operationName": "call_llm",
            "references": [{"refType": "CHILD_OF", "traceID": trace_id, "spanID": "invoke1"}],
            "startTime": 5000000,
            "duration": 1000000,
            "tags": [
                {"key": "otel.scope.name", "type": "string", "value": "gcp.vertex.agent"},
                {
                    "key": "gcp.vertex.agent.llm_response",
                    "type": "string",
                    "value": json.dumps({"content": {"role": "model", "parts": [{"text": "done"}]}}),
                },
            ],
            "logs": [],
            "processID": "p1",
        }
    )
    trace_file.write_text(
        json.dumps(
            {
                "data": [
                    {
                        "traceID": trace_id,
                        "spans": spans,
                        "processes": {"p1": {"serviceName": "test_agent", "tags": []}},
                    }
                ]
            }
        )
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

    def test_duplicate_required_not_collapsed(self):
        # required=["a","a"], called=["a"] → only 1 of 2 satisfied → 0.5
        assert _skills_score(["a", "a"], ["a"], order_matters=False) == pytest.approx(0.5)

    def test_duplicate_required_both_called(self):
        # required=["a","a"], called=["a","a"] → 2 of 2 satisfied → 1.0
        assert _skills_score(["a", "a"], ["a", "a"], order_matters=False) == 1.0

    def test_in_order_duplicate_required_partial(self):
        assert _skills_score(["a", "a"], ["a"], order_matters=True) == pytest.approx(0.5)


# ── Unit tests: _evaluate_skills_trajectory ──────────────────────────────────


class TestEvaluateSkillsTrajectory:
    def _invocations(self, tools: list[str]):
        trace = make_tool_trace(tools)
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

    def test_multiple_invocations_average_scores(self):
        invs = convert_traces([make_tool_trace(["search"], trace_id="t1"), make_tool_trace(["other"], trace_id="t2")])
        all_invs = [inv for result in invs for inv in result.invocations]
        metric_result = _evaluate_skills_trajectory(all_invs, ["search"], None, 0.6)
        assert metric_result.per_invocation_scores == [1.0, 0.0]
        assert metric_result.score == pytest.approx(0.5)
        assert metric_result.eval_status == "FAILED"


# ── Integration tests: evaluate_builtin_metric ───────────────────────────────


class TestEvaluateBuiltinMetricSkills:
    def _invocations(self, tools: list[str]):
        return convert_traces([make_tool_trace(tools)])[0].invocations

    def test_dispatches_to_skills_evaluator(self):
        invs = self._invocations(["geocode", "weather"])
        result = asyncio.run(
            evaluate_builtin_metric(
                metric_name=METRICS_SKILLS_TRAJECTORY,
                actual_invocations=invs,
                expected_invocations=None,
                judge_model=None,
                threshold=0.5,
                metric_kwargs={"skills": ["geocode", "weather"]},
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
                metric_kwargs={"skills": []},
            )
        )
        assert result.error is not None


# ── Integration tests: _evaluate_trace ───────────────────────────────────────


class TestSkillsTrajectoryMatchType:
    """Verify skills_trajectory_v1 scores correctly via _evaluate_trace."""

    def _run(
        self, tools: list[str], skills: list[str], match_type: str | None = None, threshold: float = 0.5
    ) -> object:
        conv_result = convert_traces([make_tool_trace(tools)])[0]
        return asyncio.run(
            _evaluate_trace(
                conv_result=conv_result,
                metrics=[METRICS_SKILLS_TRAJECTORY],
                custom_evaluators=[],
                eval_set=None,
                judge_model=None,
                threshold=threshold,
                trajectory_match_type=None,
                metric_kwargs={
                    "skills": skills,
                    "skills_trajectory_match_type": match_type,
                },
                eval_semaphore=asyncio.Semaphore(1),
            )
        ).metric_results[0]

    def test_all_skills_pass(self):
        mr = self._run(["skill_a", "skill_b"], ["skill_a", "skill_b"])
        assert mr.score == 1.0
        assert mr.eval_status == "PASSED"
        assert mr.duration_ms is not None

    def test_in_order_wrong_order_fails(self):
        mr = self._run(["skill_b", "skill_a"], ["skill_a", "skill_b"], match_type="IN_ORDER", threshold=0.8)
        assert mr.score == pytest.approx(0.5)
        assert mr.eval_status == "FAILED"

    def test_any_order_passes_regardless(self):
        mr = self._run(["skill_b", "skill_a"], ["skill_a", "skill_b"], match_type="ANY_ORDER")
        assert mr.score == 1.0
        assert mr.eval_status == "PASSED"


class TestRunEvaluationSkills:
    def test_run_evaluation_end_to_end(self, tmp_path):
        trace_file = tmp_path / "skills-trace.json"
        _write_jaeger_trace(trace_file, ["skill_a"])

        result = asyncio.run(
            run_evaluation(
                EvalRunConfig(
                    trace_files=[str(trace_file)],
                    metrics=[METRICS_SKILLS_TRAJECTORY],
                    skills_trajectory_skills=["skill_a"],
                )
            )
        )

        assert result.errors == []
        metric_result = result.trace_results[0].metric_results[0]
        assert metric_result.metric_name == METRICS_SKILLS_TRAJECTORY
        assert metric_result.score == 1.0
        assert metric_result.eval_status == "PASSED"
