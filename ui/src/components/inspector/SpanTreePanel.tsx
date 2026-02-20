import React, { useState } from 'react';
import { css } from '@emotion/react';
import { Search, X } from 'lucide-react';
import { SpanTreeNode } from './SpanTreeNode';
import type { Trace, ExtractionInfo } from '../../lib/types';

interface SpanTreePanelProps {
  trace: Trace;
  spanToDataMapping?: Map<string, ExtractionInfo[]>;
  highlightedSpanIds?: Set<string>;
  onSelectSpan?: (spanId: string) => void;
  onHoverSpan?: (spanId: string | null) => void;
}

export const SpanTreePanel: React.FC<SpanTreePanelProps> = ({
  trace,
  spanToDataMapping = new Map(),
  highlightedSpanIds = new Set(),
  onSelectSpan,
  onHoverSpan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyAgentSpans, setShowOnlyAgentSpans] = useState(true);

  const ADK_SCOPE = 'gcp.vertex.agent';

  // Check if a span is an agent-related span
  const isAgentSpan = (span: any) => {
    return span.tags['otel.scope.name'] === ADK_SCOPE;
  };

  // Recursively check if any descendant is an agent span
  const hasAgentDescendant = (span: any): boolean => {
    if (isAgentSpan(span)) return true;
    return span.children.some((child: any) => hasAgentDescendant(child));
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  // Filter spans by search query
  const matchesSearch = (operationName: string) => {
    if (!searchQuery) return true;
    return operationName.toLowerCase().includes(searchQuery.toLowerCase());
  };

  // Count visible spans
  const countVisibleSpans = (spans: typeof trace.rootSpans): number => {
    let count = 0;
    for (const span of spans) {
      if (matchesSearch(span.operationName)) count++;
      count += countVisibleSpans(span.children);
    }
    return count;
  };

  const visibleSpansCount = countVisibleSpans(trace.rootSpans);

  return (
    <div css={panelContainerStyles}>
      <div css={panelHeaderStyles}>
        <div css={headerTopStyles}>
          <h2>Span Hierarchy</h2>
          <span css={spanCountStyles}>
            {visibleSpansCount} {visibleSpansCount === 1 ? 'Span' : 'Spans'}
          </span>
        </div>

        <div css={filterRowStyles}>
          <label css={filterLabelStyles}>
            <input
              type="checkbox"
              checked={showOnlyAgentSpans}
              onChange={(e) => setShowOnlyAgentSpans(e.target.checked)}
              css={checkboxStyles}
            />
            <span>Show only agent spans</span>
          </label>
        </div>

        <div css={searchContainerStyles}>
          <Search size={14} css={searchIconStyles} />
          <input
            type="text"
            placeholder="Search spans..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            css={searchInputStyles}
          />
          {searchQuery && (
            <button onClick={handleClearSearch} css={clearButtonStyles}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div css={panelContentStyles}>
        {trace.rootSpans.length === 0 ? (
          <div css={emptyStateStyles}>
            <p>No spans found in this trace</p>
          </div>
        ) : (
          trace.rootSpans
            .filter(span => !showOnlyAgentSpans || hasAgentDescendant(span))
            .map((rootSpan) => (
              <SpanTreeNode
                key={rootSpan.spanId}
                span={rootSpan}
                depth={0}
                extractionInfo={spanToDataMapping.get(rootSpan.spanId)}
                isHighlighted={highlightedSpanIds.has(rootSpan.spanId)}
                onSelect={onSelectSpan}
                onHover={onHoverSpan}
                filterFn={showOnlyAgentSpans ? (span) => isAgentSpan(span) || hasAgentDescendant(span) : undefined}
              />
            ))
        )}
      </div>
    </div>
  );
};

const panelContainerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
`;

const panelHeaderStyles = css`
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
`;

const headerTopStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
`;

const spanCountStyles = css`
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
  padding: 4px 12px;
  background: var(--bg-primary);
  border-radius: 12px;
`;

const filterRowStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const filterLabelStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.813rem;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--accent-cyan);
  }

  span {
    transition: color 0.2s ease;
  }
`;

const checkboxStyles = css`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent-cyan);
`;

const searchContainerStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 8px 12px;
  transition: border-color 0.2s ease;

  &:focus-within {
    border-color: var(--accent-cyan);
  }
`;

const searchIconStyles = css`
  color: var(--text-secondary);
  flex-shrink: 0;
`;

const searchInputStyles = css`
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-family: var(--font-display);

  &::placeholder {
    color: var(--text-secondary);
  }
`;

const clearButtonStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 4px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
`;

const panelContentStyles = css`
  flex: 1;
  overflow-y: auto;
  background: var(--bg-surface);

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--accent-cyan);
  }
`;

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);

  p {
    font-size: 0.875rem;
    margin: 0;
  }
`;
