"""Tests for the custom evaluator JSON protocol models."""

import pytest
from pydantic import ValidationError

from agentevals._protocol import EvalResult, EvalStatus


def test_eval_result_accepts_valid_status_strings() -> None:
    raw = '{"score":1.0,"status":"PASSED","per_invocation_scores":[1.0]}'
    r = EvalResult.model_validate_json(raw)
    assert r.status == EvalStatus.PASSED
    assert r.score == 1.0


def test_eval_result_rejects_invalid_status() -> None:
    raw = '{"score":1.0,"status":"MAYBE","per_invocation_scores":[]}'
    with pytest.raises(ValidationError):
        EvalResult.model_validate_json(raw)


def test_eval_result_omitted_status_ok() -> None:
    raw = '{"score":0.5,"per_invocation_scores":[]}'
    r = EvalResult.model_validate_json(raw)
    assert r.status is None
