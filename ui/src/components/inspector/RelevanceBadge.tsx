import React from 'react';
import { css } from '@emotion/react';
import type { ExtractionType } from '../../lib/types';
import { MessageCircle, Wrench, CheckCircle, MessageSquare } from 'lucide-react';

interface RelevanceBadgeProps {
  type: ExtractionType;
  tooltip?: string;
}

export const RelevanceBadge: React.FC<RelevanceBadgeProps> = ({ type, tooltip }) => {
  const { color, Icon } = getBadgeStyle(type);

  return (
    <div css={badgeContainerStyles(color)} title={tooltip || `Extracted: ${type}`}>
      <Icon size={10} />
    </div>
  );
};

function getBadgeStyle(type: ExtractionType) {
  switch (type) {
    case 'user_input':
      return { color: 'var(--accent-purple)', Icon: MessageCircle };
    case 'tool_use':
      return { color: 'var(--accent-lime)', Icon: Wrench };
    case 'tool_response':
      return { color: 'var(--accent-orange)', Icon: CheckCircle };
    case 'final_response':
      return { color: 'var(--accent-cyan)', Icon: MessageSquare };
  }
}

const badgeContainerStyles = (color: string) => css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${color}22;
  border: 1px solid ${color};
  color: ${color};
  transition: all 0.2s ease;

  &:hover {
    background: ${color}44;
    box-shadow: 0 0 8px ${color}66;
  }
`;
