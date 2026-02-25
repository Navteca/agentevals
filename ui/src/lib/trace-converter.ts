import type { Trace, Span, Invocation, Content, ToolCall, ToolResponse } from './types';
import { safeJsonParse } from './utils';

const ADK_SCOPE = 'gcp.vertex.agent';

interface ConversionResult {
  invocations: Invocation[];
  warnings: string[];
}

/**
 * Convert traces to ADK Invocations
 */
export function convertTracesToInvocations(traces: Trace[]): Map<string, ConversionResult> {
  const results = new Map<string, ConversionResult>();

  for (const trace of traces) {
    const warnings: string[] = [];
    const invocations: Invocation[] = [];

    console.log(`Converting trace ${trace.traceId}:`);
    console.log(`  Total spans: ${trace.allSpans.length}`);

    // Debug: log all span operation names and scopes
    trace.allSpans.forEach((span, idx) => {
      console.log(`  Span ${idx}: ${span.operationName}, scope: ${span.tags['otel.scope.name']}`);
    });

    // Find all invoke_agent spans
    const agentSpans = trace.allSpans.filter(
      (span) =>
        span.operationName.includes('invoke_agent') &&
        span.tags['otel.scope.name'] === ADK_SCOPE
    );

    console.log(`  Found ${agentSpans.length} invoke_agent spans with ADK scope`);

    for (const agentSpan of agentSpans) {
      try {
        const invocation = convertAgentSpanToInvocation(agentSpan);
        if (invocation) {
          invocations.push(invocation);
          console.log(`  Created invocation: ${invocation.invocationId}`);
        } else {
          console.log(`  convertAgentSpanToInvocation returned null for span ${agentSpan.spanId}`);
        }
      } catch (error) {
        const errorMsg = `Failed to convert span ${agentSpan.spanId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        warnings.push(errorMsg);
        console.error(`  ${errorMsg}`);
      }
    }

    console.log(`  Final invocations count: ${invocations.length}`);
    results.set(trace.traceId, { invocations, warnings });
  }

  return results;
}

/**
 * Recursively find child spans by operation name prefix
 * (replicates Python's _find_children_by_op)
 */
function findChildrenByOperation(root: Span, opPrefix: string): Span[] {
  const results: Span[] = [];
  walkSpanTree(root, opPrefix, results);
  results.sort((a, b) => a.startTime - b.startTime);
  return results;
}

/**
 * Recursive walker for span tree
 * (replicates Python's _walk)
 */
function walkSpanTree(span: Span, opPrefix: string, acc: Span[]): void {
  for (const child of span.children) {
    if (child.operationName.startsWith(opPrefix)) {
      acc.push(child);
    }
    walkSpanTree(child, opPrefix, acc);
  }
}

/**
 * Convert single agent span to Invocation
 */
function convertAgentSpanToInvocation(agentSpan: Span): Invocation | null {
  console.log(`    Converting agent span ${agentSpan.spanId}:`);
  console.log(`      Children count: ${agentSpan.children.length}`);

  // Recursively find child spans by operation name (like Python's _find_children_by_op)
  const llmSpans = findChildrenByOperation(agentSpan, 'call_llm');
  const toolSpans = findChildrenByOperation(agentSpan, 'execute_tool');

  console.log(`      LLM spans: ${llmSpans.length}, Tool spans: ${toolSpans.length}`);

  if (llmSpans.length === 0) {
    console.log(`      Skipping: No LLM spans found`);
    return null; // No LLM calls, skip
  }

  // Extract user content from first LLM span
  const userContent = extractUserContent(llmSpans[0]);
  if (!userContent) {
    console.log(`      Skipping: Failed to extract user content`);
    return null;
  }

  // Extract final response from last LLM span
  const finalResponse = extractFinalResponse(llmSpans[llmSpans.length - 1]);
  if (!finalResponse) {
    console.log(`      Skipping: Failed to extract final response`);
    return null;
  }

  // Extract tool trajectory
  const { toolUses, toolResponses } = extractToolTrajectory(toolSpans, llmSpans);

  return {
    invocationId: agentSpan.spanId,
    userContent,
    finalResponse,
    intermediateData: {
      toolUses,
      toolResponses,
    },
    creationTimestamp: agentSpan.startTime,
  };
}

/**
 * Extract user content from LLM request
 */
function extractUserContent(llmSpan: Span): Content | null {
  const requestJson = llmSpan.tags['gcp.vertex.agent.llm_request'];
  if (!requestJson) return null;

  const request = safeJsonParse<any>(requestJson, null);
  if (!request || !request.contents) return null;

  // Find last user message with text parts (skip function_response parts)
  for (let i = request.contents.length - 1; i >= 0; i--) {
    const content = request.contents[i];
    if (content.role === 'user') {
      const textParts = content.parts?.filter((p: any) => p.text !== undefined);
      if (textParts && textParts.length > 0) {
        return {
          role: 'user',
          parts: textParts,
        };
      }
    }
  }

  return null;
}

/**
 * Extract final response from LLM response
 */
function extractFinalResponse(llmSpan: Span): Content | null {
  const responseJson = llmSpan.tags['gcp.vertex.agent.llm_response'];
  if (!responseJson) return null;

  const response = safeJsonParse<any>(responseJson, null);
  if (!response || !response.content) return null;

  // Extract text parts only (skip function_call parts for final response)
  const textParts = response.content.parts?.filter((p: any) => p.text !== undefined) || [];

  return {
    role: 'model',
    parts: textParts,
  };
}

/**
 * Extract tool trajectory from execute_tool spans or LLM function calls
 */
function extractToolTrajectory(
  toolSpans: Span[],
  llmSpans: Span[]
): { toolUses: ToolCall[]; toolResponses: ToolResponse[] } {
  const toolUses: ToolCall[] = [];
  const toolResponses: ToolResponse[] = [];

  // Prefer execute_tool spans if available
  if (toolSpans.length > 0) {
    for (const toolSpan of toolSpans) {
      const toolName = toolSpan.tags['gen_ai.tool.name'];
      const toolCallId = toolSpan.tags['gen_ai.tool.call.id'];
      const argsJson = toolSpan.tags['gcp.vertex.agent.tool_call_args'];
      const responseJson = toolSpan.tags['gcp.vertex.agent.tool_response'];

      if (toolName) {
        const args = safeJsonParse<Record<string, any>>(argsJson || '{}', {});
        toolUses.push({
          name: toolName,
          args,
          id: toolCallId,
        });

        if (responseJson) {
          const response = safeJsonParse<Record<string, any>>(responseJson, {});
          toolResponses.push({
            name: toolName,
            response,
            id: toolCallId,
          });
        }
      }
    }
  } else {
    // Fallback: extract from LLM function calls
    for (const llmSpan of llmSpans) {
      const responseJson = llmSpan.tags['gcp.vertex.agent.llm_response'];
      if (!responseJson) continue;

      const response = safeJsonParse<any>(responseJson, null);
      if (!response || !response.content || !response.content.parts) continue;

      const functionCalls = response.content.parts.filter((p: any) => p.functionCall);
      for (const part of functionCalls) {
        if (part.functionCall) {
          toolUses.push({
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            id: part.functionCall.id,
          });
        }
      }
    }
  }

  return { toolUses, toolResponses };
}

/**
 * Get invocations for a specific trace
 */
export function getInvocationsForTrace(
  trace: Trace,
  conversionResults: Map<string, ConversionResult>
): ConversionResult | undefined {
  return conversionResults.get(trace.traceId);
}
