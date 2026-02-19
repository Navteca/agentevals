import React, { useState } from 'react';
import { css } from '@emotion/react';
import { ChevronRight, ChevronDown, Circle, Activity, Wrench, MessageSquare, Globe } from 'lucide-react';
import { RelevanceBadge } from './RelevanceBadge';
import type { Span, ExtractionInfo } from '../../lib/types';
import { formatDuration } from '../../lib/utils';

interface SpanTreeNodeProps {
  span: Span;
  depth: number;
  extractionInfo?: ExtractionInfo[];
  isHighlighted?: boolean;
  onSelect?: (spanId: string) => void;
  onHover?: (spanId: string | null) => void;
  filterFn?: (span: Span) => boolean;
}

export const SpanTreeNode: React.FC<SpanTreeNodeProps> = ({
  span,
  depth,
  extractionInfo = [],
  isHighlighted = false,
  onSelect,
  onHover,
  filterFn,
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // Auto-expand all by default

  // Filter children if filterFn is provided
  const visibleChildren = filterFn
    ? span.children.filter(filterFn)
    : span.children;

  const hasChildren = visibleChildren.length > 0;
  const operationType = getOperationType(span.operationName);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleClick = () => {
    onSelect?.(span.spanId);
  };

  const handleMouseEnter = () => {
    onHover?.(span.spanId);
  };

  const handleMouseLeave = () => {
    onHover?.(null);
  };

  return (
    <>
      <div
        css={nodeRowStyles(depth, isHighlighted)}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-span-id={span.spanId}
      >
        <div css={nodeContentStyles}>
          <div
            css={expandIconStyles(hasChildren)}
            onClick={handleToggle}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <Circle size={4} />
            )}
          </div>

          <div css={operationIconStyles(operationType.color)}>
            {operationType.Icon && <operationType.Icon size={14} />}
          </div>

          <span css={operationNameStyles}>
            {span.operationName}
          </span>

          {extractionInfo.length > 0 && (
            <div css={badgesContainerStyles}>
              {extractionInfo.map((info, idx) => (
                <RelevanceBadge
                  key={idx}
                  type={info.type}
                  tooltip={`Extracted ${info.type} from ${info.tagPath}`}
                />
              ))}
            </div>
          )}

          <span css={durationStyles}>
            {formatDuration(span.duration)}
          </span>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div css={childrenContainerStyles}>
          {visibleChildren.map((child) => (
            <SpanTreeNode
              key={child.spanId}
              span={child}
              depth={depth + 1}
              extractionInfo={[]} // Will be populated in Step 5
              isHighlighted={false}
              onSelect={onSelect}
              onHover={onHover}
              filterFn={filterFn}
            />
          ))}
        </div>
      )}
    </>
  );
};

function getOperationType(operationName: string) {
  if (operationName.includes('invoke_agent')) {
    return { color: 'var(--accent-cyan)', Icon: Activity };
  }
  if (operationName.includes('call_llm')) {
    return { color: 'var(--accent-purple)', Icon: MessageSquare };
  }
  if (operationName.includes('execute_tool')) {
    return { color: 'var(--accent-lime)', Icon: Wrench };
  }
  if (operationName.includes('http') || operationName.includes('request')) {
    return { color: 'var(--accent-orange)', Icon: Globe };
  }
  return { color: 'var(--text-secondary)', Icon: Circle };
}

const nodeRowStyles = (depth: number, isHighlighted: boolean) => css`
  padding: 6px 12px 6px ${depth * 20 + 12}px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 2px solid transparent;
  user-select: none;

  ${isHighlighted && `
    background: var(--bg-elevated);
    border-left-color: var(--accent-cyan);
  `}

  &:hover {
    background: var(--bg-elevated);
    border-left-color: var(--accent-cyan);
  }
`;

const nodeContentStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const expandIconStyles = (hasChildren: boolean) => css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
  flex-shrink: 0;
  cursor: ${hasChildren ? 'pointer' : 'default'};

  &:hover {
    color: ${hasChildren ? 'var(--accent-cyan)' : 'var(--text-secondary)'};
  }
`;

const operationIconStyles = (color: string) => css`
  display: flex;
  align-items: center;
  color: ${color};
  flex-shrink: 0;
`;

const operationNameStyles = css`
  font-family: var(--font-mono);
  font-size: 0.813rem;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const badgesContainerStyles = css`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
`;

const durationStyles = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 60px;
  text-align: right;
`;

const childrenContainerStyles = css`
  /* Children are rendered as siblings with increased depth */
`;
