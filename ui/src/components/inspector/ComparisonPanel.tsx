import React from 'react';
import { css } from '@emotion/react';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type { Invocation, MetricResult } from '../../lib/types';

interface ComparisonPanelProps {
  actualInvocation: Invocation | null;
  expectedInvocation: Invocation | null;
  metricResults: MetricResult[];
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  actualInvocation,
  expectedInvocation,
  metricResults,
}) => {
  if (!actualInvocation) {
    return (
      <div css={emptyStateStyles}>
        <AlertCircle size={32} />
        <p>Select an invocation to see comparison</p>
      </div>
    );
  }

  if (!expectedInvocation) {
    return (
      <div css={emptyStateStyles}>
        <AlertCircle size={32} />
        <p>No matching eval case found</p>
        <span css={subtextStyles}>
          This trace doesn't have a corresponding expected invocation in the eval set
        </span>
      </div>
    );
  }

  // Extract text from parts
  const getTextFromParts = (parts: any[]) => {
    return parts.filter(p => p.text).map(p => p.text).join('\n');
  };

  const actualUserText = getTextFromParts(actualInvocation.userContent.parts);
  const expectedUserText = getTextFromParts(expectedInvocation.userContent.parts);
  const userInputMatches = actualUserText.trim() === expectedUserText.trim();

  const actualResponseText = getTextFromParts(actualInvocation.finalResponse.parts);
  const expectedResponseText = getTextFromParts(expectedInvocation.finalResponse.parts);
  const responseMatches = actualResponseText.trim() === expectedResponseText.trim();

  // Compare tool trajectories
  const actualTools = (actualInvocation.intermediateData?.toolUses || []).map(t => t.name);
  const expectedTools = (expectedInvocation.intermediateData?.toolUses || []).map(t => t.name);
  const toolsMatch = JSON.stringify(actualTools) === JSON.stringify(expectedTools);

  // Find failed metrics
  const failedMetrics = metricResults.filter(m => m.evalStatus === 'FAILED');

  return (
    <div css={panelContainerStyles}>
      <div css={panelHeaderStyles}>
        <h2>Evaluation Comparison</h2>
        {failedMetrics.length > 0 ? (
          <div css={failedBadgeStyles}>
            <XCircle size={14} />
            {failedMetrics.length} Failed
          </div>
        ) : (
          <div css={passedBadgeStyles}>
            <CheckCircle size={14} />
            All Passed
          </div>
        )}
      </div>

      <div css={panelContentStyles}>
        {/* Failed Metrics Summary */}
        {failedMetrics.length > 0 && (
          <div css={sectionStyles}>
            <h3 css={sectionTitleStyles}>Failed Metrics</h3>
            <div css={metricsListStyles}>
              {failedMetrics.map((metric, idx) => (
                <div key={idx} css={metricItemStyles}>
                  <XCircle size={14} css={failureIconStyles} />
                  <span css={metricNameStyles}>{metric.metricName}</span>
                  {metric.score !== null && (
                    <span css={scoreStyles}>{metric.score.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Input Comparison */}
        <div css={sectionStyles}>
          <h3 css={sectionTitleStyles}>
            User Input
            {userInputMatches ? (
              <CheckCircle size={16} css={successIconStyles} />
            ) : (
              <XCircle size={16} css={failureIconStyles} />
            )}
          </h3>
          <div css={comparisonContainerStyles}>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Expected</div>
              <div css={textBoxStyles(userInputMatches)}>
                {expectedUserText || <span css={emptyTextStyles}>No text</span>}
              </div>
            </div>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Actual</div>
              <div css={textBoxStyles(userInputMatches)}>
                {actualUserText || <span css={emptyTextStyles}>No text</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Tool Trajectory Comparison */}
        <div css={sectionStyles}>
          <h3 css={sectionTitleStyles}>
            Tool Trajectory
            {toolsMatch ? (
              <CheckCircle size={16} css={successIconStyles} />
            ) : (
              <XCircle size={16} css={failureIconStyles} />
            )}
          </h3>
          <div css={comparisonContainerStyles}>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Expected</div>
              <div css={toolListStyles}>
                {expectedTools.length > 0 ? (
                  expectedTools.map((tool, idx) => (
                    <div
                      key={idx}
                      css={toolItemStyles(actualTools.includes(tool))}
                    >
                      {idx + 1}. {tool}
                    </div>
                  ))
                ) : (
                  <span css={emptyTextStyles}>No tools</span>
                )}
              </div>
            </div>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Actual</div>
              <div css={toolListStyles}>
                {actualTools.length > 0 ? (
                  actualTools.map((tool, idx) => (
                    <div
                      key={idx}
                      css={toolItemStyles(expectedTools.includes(tool))}
                    >
                      {idx + 1}. {tool}
                    </div>
                  ))
                ) : (
                  <span css={emptyTextStyles}>No tools</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Final Response Comparison */}
        <div css={sectionStyles}>
          <h3 css={sectionTitleStyles}>
            Final Response
            {responseMatches ? (
              <CheckCircle size={16} css={successIconStyles} />
            ) : (
              <XCircle size={16} css={failureIconStyles} />
            )}
          </h3>
          <div css={comparisonContainerStyles}>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Expected</div>
              <div css={textBoxStyles(responseMatches)}>
                {expectedResponseText || <span css={emptyTextStyles}>No response</span>}
              </div>
            </div>
            <div css={comparisonColumnStyles}>
              <div css={columnLabelStyles}>Actual</div>
              <div css={textBoxStyles(responseMatches)}>
                {actualResponseText || <span css={emptyTextStyles}>No response</span>}
              </div>
            </div>
          </div>
        </div>
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
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
`;

const passedBadgeStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(124, 255, 107, 0.1);
  border: 1px solid var(--status-success);
  border-radius: 12px;
  color: var(--status-success);
  font-size: 0.75rem;
  font-weight: 600;
`;

const failedBadgeStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 87, 87, 0.1);
  border: 1px solid var(--status-failure);
  border-radius: 12px;
  color: var(--status-failure);
  font-size: 0.75rem;
  font-weight: 600;
`;

const panelContentStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 16px;

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
  gap: 12px;

  svg {
    opacity: 0.3;
  }

  p {
    font-size: 0.875rem;
    margin: 0;
    color: var(--text-primary);
  }
`;

const subtextStyles = css`
  font-size: 0.75rem;
  color: var(--text-secondary);
  max-width: 250px;
`;

const sectionStyles = css`
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const sectionTitleStyles = css`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const successIconStyles = css`
  color: var(--status-success);
`;

const failureIconStyles = css`
  color: var(--status-failure);
`;

const metricsListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const metricItemStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
  border-left: 3px solid var(--status-failure);
`;

const metricNameStyles = css`
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
`;

const scoreStyles = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--status-failure);
  font-weight: 600;
`;

const comparisonContainerStyles = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const comparisonColumnStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const columnLabelStyles = css`
  font-size: 0.688rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const textBoxStyles = (matches: boolean) => css`
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
  border: 1px solid ${matches ? 'var(--status-success)' : 'var(--status-failure)'};
  font-size: 0.813rem;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  min-height: 80px;
`;

const emptyTextStyles = css`
  color: var(--text-secondary);
  font-style: italic;
`;

const toolListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const toolItemStyles = (matches: boolean) => css`
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-radius: 4px;
  border-left: 3px solid ${matches ? 'var(--status-success)' : 'var(--status-failure)'};
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
`;
