"""Centralized OTel span attribute key constants.

Single source of truth for all attribute names used across the converter,
extraction, streaming, and runner modules.
"""

# OTel scope
OTEL_SCOPE = "otel.scope.name"
OTEL_SCOPE_VERSION = "otel.scope.version"

# Google ADK scope value
ADK_SCOPE_VALUE = "gcp.vertex.agent"

# Standard OTel GenAI semantic conventions (gen_ai.*)
OTEL_GENAI_OP = "gen_ai.operation.name"
OTEL_GENAI_AGENT_NAME = "gen_ai.agent.name"
OTEL_GENAI_REQUEST_MODEL = "gen_ai.request.model"
OTEL_GENAI_INPUT_MESSAGES = "gen_ai.input.messages"
OTEL_GENAI_OUTPUT_MESSAGES = "gen_ai.output.messages"
OTEL_GENAI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens"
OTEL_GENAI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens"
OTEL_GENAI_TOOL_NAME = "gen_ai.tool.name"
OTEL_GENAI_TOOL_CALL_ID = "gen_ai.tool.call.id"
OTEL_GENAI_TOOL_CALL_ARGUMENTS = "gen_ai.tool.call.arguments"
OTEL_GENAI_TOOL_CALL_RESULT = "gen_ai.tool.call.result"

# ADK-specific custom attributes (gcp.vertex.agent.*)
ADK_LLM_REQUEST = "gcp.vertex.agent.llm_request"
ADK_LLM_RESPONSE = "gcp.vertex.agent.llm_response"
ADK_TOOL_CALL_ARGS = "gcp.vertex.agent.tool_call_args"
ADK_TOOL_RESPONSE = "gcp.vertex.agent.tool_response"
ADK_INVOCATION_ID = "gcp.vertex.agent.invocation_id"
