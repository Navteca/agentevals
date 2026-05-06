"""Storage model unit tests: pure functions, validation, model construction."""

from __future__ import annotations

import hashlib
from uuid import UUID

import pytest

from agentevals.storage.models import (
    Run,
    RunSpec,
    RunStatus,
    TraceTarget,
    compute_result_id,
)


class TestComputeResultId:
    def test_deterministic(self):
        a = compute_result_id("00000000-0000-0000-0000-000000000001", "item-x", "metric-y")
        b = compute_result_id("00000000-0000-0000-0000-000000000001", "item-x", "metric-y")
        assert a == b

    def test_uuid_lowercased(self):
        upper = compute_result_id("00000000-0000-0000-0000-00000000ABCD", "item", "m")
        lower = compute_result_id("00000000-0000-0000-0000-00000000abcd", "item", "m")
        assert upper == lower

    def test_uuid_object_and_string_match(self):
        u = UUID("00000000-0000-0000-0000-000000000001")
        assert compute_result_id(u, "item", "m") == compute_result_id(str(u), "item", "m")

    def test_pipe_delimiter_byte_spec(self):
        """Locks the canonical formula so producer (Python) and any future
        consumer agree byte-for-byte. Any change here is a breaking change."""
        expected = hashlib.sha256(b"abc|item|m").hexdigest()
        assert compute_result_id("abc", "item", "m") == expected


class TestTraceTargetValidation:
    def test_inline(self):
        t = TraceTarget(kind="inline", inline={"data": []})
        assert t.kind == "inline"

    def test_http_with_base_url(self):
        t = TraceTarget(kind="http", base_url="https://example/", trace_id="abc")
        assert t.base_url == "https://example/"
        assert t.trace_id == "abc"

    def test_uploaded_with_audit_metadata(self):
        t = TraceTarget(kind="uploaded", trace_count=2, trace_files=["a.json", "b.json"])
        assert t.kind == "uploaded"
        assert t.trace_count == 2
        assert t.trace_files == ["a.json", "b.json"]

    def test_unknown_kind_rejected(self):
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            TraceTarget(kind="not-a-kind")


class TestRunSpec:
    def test_minimal_inline_spec(self):
        spec = RunSpec(approach="trace_replay", target=TraceTarget(kind="inline", inline={}))
        assert spec.approach == "trace_replay"
        assert spec.target.kind == "inline"
        assert spec.eval_set is None
        assert spec.eval_config == {}
        assert spec.sinks == []
        assert spec.context == {}

    def test_extra_fields_allowed_for_forward_compat(self):
        """RunSpec uses extra='allow' so a host can include forward-compatible
        metadata without breaking older agentevals replicas."""
        spec = RunSpec.model_validate(
            {
                "approach": "trace_replay",
                "target": {"kind": "inline", "inline": {}},
                "futureField": "unknown",
            }
        )
        assert spec.target.kind == "inline"


class TestRun:
    def test_default_status_and_attempt(self):
        run = Run(
            run_id=UUID("00000000-0000-0000-0000-000000000001"),
            status=RunStatus.QUEUED,
            spec=RunSpec(approach="trace_replay", target=TraceTarget(kind="inline", inline={})),
        )
        assert run.attempt == 0
        assert run.cancel_requested is False
        assert run.error is None
