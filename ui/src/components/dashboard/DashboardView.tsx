import React, { useState } from 'react';
import { css } from '@emotion/react';
import { Button, Input, Select } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { TraceCard } from './TraceCard';
import { SummaryStats } from './SummaryStats';
import { useTraceContext } from '../../context/TraceContext';
import type { EvalStatus } from '../../lib/types';

const dashboardStyle = css`
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }

  .title {
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .filters {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    padding: 16px;
    background-color: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 8px;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 24px;
  }

  .empty-state {
    text-align: center;
    padding: 64px 24px;
    color: var(--text-secondary);
  }

  .empty-title {
    font-size: 1.5rem;
    margin-bottom: 12px;
  }

  .errors {
    background-color: rgba(255, 87, 87, 0.1);
    border: 1px solid var(--status-failure);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .error-title {
    color: var(--status-failure);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .error-list {
    list-style: none;
    padding-left: 0;
  }

  .error-item {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 4px;
  }

  @media (max-width: 968px) {
    .results-grid {
      grid-template-columns: 1fr;
    }

    .filters {
      flex-direction: column;
    }
  }
`;

const { Search } = Input;

export const DashboardView: React.FC = () => {
  const { state, actions } = useTraceContext();
  const [filterStatus, setFilterStatus] = useState<'all' | EvalStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter results
  const filteredResults = state.results.filter((result) => {
    // Filter by status
    if (filterStatus !== 'all') {
      const hasMatchingStatus = result.metricResults.some(
        (m) => m.evalStatus === filterStatus
      );
      if (!hasMatchingStatus) return false;
    }

    // Filter by search term
    if (searchTerm) {
      return result.traceId.toLowerCase().includes(searchTerm.toLowerCase());
    }

    return true;
  });

  const handleTraceClick = (traceId: string) => {
    actions.selectTrace(traceId);
    actions.setCurrentView('inspector');
  };

  return (
    <div css={dashboardStyle}>
      <div className="header">
        <h1 className="title">Evaluation Results</h1>
        <Button
          icon={<ArrowLeft size={16} />}
          onClick={() => actions.setCurrentView('upload')}
        >
          Back to Upload
        </Button>
      </div>

      {state.errors.length > 0 && (
        <div className="errors">
          <div className="error-title">Errors</div>
          <ul className="error-list">
            {state.errors.map((error, idx) => (
              <li key={idx} className="error-item">
                • {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.results.length > 0 && (
        <>
          <SummaryStats traceResults={state.results} />

          <div className="filters">
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 200 }}
              options={[
                { label: 'All Statuses', value: 'all' },
                { label: 'Passed', value: 'PASSED' },
                { label: 'Failed', value: 'FAILED' },
                { label: 'Not Evaluated', value: 'NOT_EVALUATED' },
                { label: 'Errors', value: 'ERROR' },
              ]}
            />
            <Search
              placeholder="Search by trace ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, maxWidth: 400 }}
            />
          </div>

          <div className="results-grid">
            {filteredResults.map((result) => (
              <TraceCard
                key={result.traceId}
                traceResult={result}
                threshold={state.threshold}
                onClick={() => handleTraceClick(result.traceId)}
              />
            ))}
          </div>

          {filteredResults.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">No traces match your filters</div>
              <p>Try adjusting your filter or search criteria</p>
            </div>
          )}
        </>
      )}

      {state.results.length === 0 && state.errors.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">No results yet</div>
          <p>Upload trace files and run an evaluation to see results here</p>
        </div>
      )}
    </div>
  );
};
