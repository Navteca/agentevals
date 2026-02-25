import type { Trace, Span, Log } from './types';

interface JaegerTag {
  key: string;
  type: string;
  value: any;
}

interface JaegerLog {
  timestamp: number;
  fields: JaegerTag[];
}

interface JaegerReference {
  refType: string;
  traceID: string;
  spanID: string;
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  references?: JaegerReference[];
  startTime: number;
  duration: number;
  tags?: JaegerTag[];
  logs?: JaegerLog[];
}

interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
}

interface JaegerData {
  data: JaegerTrace[];
}

/**
 * Load traces from Jaeger JSON file
 */
export async function loadJaegerTraces(fileContent: string): Promise<Trace[]> {
  const jaegerData: JaegerData = JSON.parse(fileContent);

  return jaegerData.data.map((jTrace) => {
    // Parse all spans first
    const spanMap = new Map<string, Span>();

    for (const jSpan of jTrace.spans) {
      const span: Span = {
        traceId: jSpan.traceID,
        spanId: jSpan.spanID,
        parentSpanId: extractParentSpanId(jSpan.references),
        operationName: jSpan.operationName,
        startTime: jSpan.startTime,
        duration: jSpan.duration,
        tags: flattenTags(jSpan.tags || []),
        logs: flattenLogs(jSpan.logs || []),
        children: [],
      };

      spanMap.set(span.spanId, span);
    }

    // Build parent-child relationships
    const rootSpans: Span[] = [];

    for (const span of spanMap.values()) {
      if (span.parentSpanId) {
        const parent = spanMap.get(span.parentSpanId);
        if (parent) {
          parent.children.push(span);
        } else {
          // Parent not found, treat as root
          rootSpans.push(span);
        }
      } else {
        rootSpans.push(span);
      }
    }

    // Sort children by start time
    const sortSpans = (spans: Span[]) => {
      spans.sort((a, b) => a.startTime - b.startTime);
      spans.forEach((span) => sortSpans(span.children));
    };

    sortSpans(rootSpans);

    return {
      traceId: jTrace.traceID,
      rootSpans,
      allSpans: Array.from(spanMap.values()).sort((a, b) => a.startTime - b.startTime),
    };
  });
}

/**
 * Extract parent span ID from references
 */
function extractParentSpanId(references?: JaegerReference[]): string | null {
  if (!references) return null;

  const parentRef = references.find((ref) => ref.refType === 'CHILD_OF');
  return parentRef ? parentRef.spanID : null;
}

/**
 * Flatten Jaeger tags array to a key-value object
 */
function flattenTags(tags: JaegerTag[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const tag of tags) {
    result[tag.key] = tag.value;
  }

  return result;
}

/**
 * Flatten Jaeger logs
 */
function flattenLogs(logs: JaegerLog[]): Log[] {
  return logs.map((log) => ({
    timestamp: log.timestamp,
    fields: flattenTags(log.fields),
  }));
}

/**
 * Find spans by operation name
 */
export function findSpansByOperation(trace: Trace, operationName: string): Span[] {
  return trace.allSpans.filter((span) => span.operationName.includes(operationName));
}

/**
 * Find spans by tag key-value
 */
export function findSpansByTag(trace: Trace, tagKey: string, tagValue?: any): Span[] {
  return trace.allSpans.filter((span) => {
    if (!(tagKey in span.tags)) return false;
    if (tagValue === undefined) return true;
    return span.tags[tagKey] === tagValue;
  });
}

/**
 * Get span by ID
 */
export function getSpanById(trace: Trace, spanId: string): Span | undefined {
  return trace.allSpans.find((span) => span.spanId === spanId);
}
