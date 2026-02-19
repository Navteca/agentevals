import React, { useState, useRef, useEffect } from 'react';
import { css } from '@emotion/react';

interface InspectorLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const STORAGE_KEY = 'inspector-panel-widths';

export const InspectorLayout: React.FC<InspectorLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { left } = JSON.parse(stored);
      return left || 400;
    }
    return 400;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { right } = JSON.parse(stored);
      return right || 400;
    }
    return 400;
  });

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Save to localStorage when widths change
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ left: leftWidth, right: rightWidth })
    );
  }, [leftWidth, rightWidth]);

  // Handle left divider drag
  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  };

  // Handle right divider drag
  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();

      if (isDraggingLeft) {
        const newWidth = e.clientX - containerRect.left;
        const constrainedWidth = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, newWidth)
        );
        setLeftWidth(constrainedWidth);
      }

      if (isDraggingRight) {
        const newWidth = containerRect.right - e.clientX;
        const constrainedWidth = Math.max(
          MIN_PANEL_WIDTH,
          Math.min(MAX_PANEL_WIDTH, newWidth)
        );
        setRightWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingLeft, isDraggingRight]);

  return (
    <div
      ref={containerRef}
      css={layoutStyles(leftWidth, rightWidth)}
      className={isDraggingLeft || isDraggingRight ? 'dragging' : ''}
    >
      <div css={panelStyles} className="left-panel">
        {leftPanel}
      </div>

      <div
        css={dividerStyles}
        className="divider left-divider"
        onMouseDown={handleLeftMouseDown}
      />

      <div css={panelStyles} className="center-panel">
        {centerPanel}
      </div>

      <div
        css={dividerStyles}
        className="divider right-divider"
        onMouseDown={handleRightMouseDown}
      />

      <div css={panelStyles} className="right-panel">
        {rightPanel}
      </div>
    </div>
  );
};

const layoutStyles = (leftWidth: number, rightWidth: number) => css`
  display: grid;
  grid-template-columns: ${leftWidth}px 1px 1fr 1px ${rightWidth}px;
  height: calc(100vh - 64px); /* Subtract header height */
  overflow: hidden;

  &.dragging {
    user-select: none;
    cursor: col-resize;
  }
`;

const panelStyles = css`
  background: var(--bg-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &.left-panel {
    border-right: 1px solid var(--border-default);
  }

  &.right-panel {
    border-left: 1px solid var(--border-default);
  }
`;

const dividerStyles = css`
  background: var(--border-default);
  cursor: col-resize;
  position: relative;
  transition: background 0.2s ease, width 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    right: -4px;
  }

  &:hover {
    background: var(--accent-cyan);
    width: 3px;
  }

  &:active {
    background: var(--accent-cyan);
    width: 3px;
  }
`;
