"""Shared test fixtures and helpers."""

import json

from agentevals.loader.base import Span, Trace


def make_tool_trace(tools: list[str], trace_id: str = "t1") -> Trace:
    """Build a minimal ADK trace calling the given tools in order."""
    invoke = Span(
        trace_id=trace_id,
        span_id="invoke1",
        parent_span_id=None,
        operation_name="invoke_agent test_agent",
        start_time=1000,
        duration=10000,
        tags={"otel.scope.name": "gcp.vertex.agent"},
    )
    call_llm_1 = Span(
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
    call_llm_2 = Span(
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
    invoke.children = [call_llm_1, *tool_spans, call_llm_2]
    return Trace(
        trace_id=trace_id,
        root_spans=[invoke],
        all_spans=[invoke, call_llm_1, *tool_spans, call_llm_2],
    )
