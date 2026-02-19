import React, { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { TraceContext } from './TraceContext';
import type { TraceState } from './TraceContext';
import type { ViewType } from '../lib/types';
import { evaluateTraces } from '../lib/evaluator';

interface TraceProviderProps {
  children: ReactNode;
}

export const TraceProvider: React.FC<TraceProviderProps> = ({ children }) => {
  const [state, setState] = useState<TraceState>({
    traceFiles: [],
    evalSetFile: null,
    selectedMetrics: ['tool_trajectory_avg_score'],
    judgeModel: 'gemini-2.5-flash',
    threshold: 0.8,
    isEvaluating: false,
    results: [],
    errors: [],
    currentView: 'upload',
    selectedTraceId: null,
    selectedSpanId: null,
  });

  const actions = useMemo(
    () => ({
      setTraceFiles: (files: File[]) =>
        setState((prev) => ({ ...prev, traceFiles: files })),

      setEvalSet: (file: File | null) =>
        setState((prev) => ({ ...prev, evalSetFile: file })),

      toggleMetric: (metric: string) =>
        setState((prev) => ({
          ...prev,
          selectedMetrics: prev.selectedMetrics.includes(metric)
            ? prev.selectedMetrics.filter((m) => m !== metric)
            : [...prev.selectedMetrics, metric],
        })),

      setJudgeModel: (model: string) =>
        setState((prev) => ({ ...prev, judgeModel: model })),

      setThreshold: (threshold: number) =>
        setState((prev) => ({ ...prev, threshold })),

      runEvaluation: async () => {
        setState((prev) => ({ ...prev, isEvaluating: true, errors: [] }));

        try {
          const result = await evaluateTraces(
            state.traceFiles,
            state.evalSetFile,
            {
              metrics: state.selectedMetrics,
              judgeModel: state.judgeModel,
              threshold: state.threshold,
            }
          );

          setState((prev) => ({
            ...prev,
            isEvaluating: false,
            results: result.traceResults,
            errors: result.errors,
            currentView: 'dashboard',
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            isEvaluating: false,
            errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
          }));
        }
      },

      setCurrentView: (view: ViewType) =>
        setState((prev) => ({ ...prev, currentView: view })),

      selectTrace: (traceId: string | null) =>
        setState((prev) => ({ ...prev, selectedTraceId: traceId })),

      selectSpan: (spanId: string | null) =>
        setState((prev) => ({ ...prev, selectedSpanId: spanId })),

      clearResults: () =>
        setState((prev) => ({
          ...prev,
          results: [],
          errors: [],
          currentView: 'upload',
        })),
    }),
    [state.traceFiles, state.evalSetFile, state.selectedMetrics, state.judgeModel, state.threshold]
  );

  return (
    <TraceContext.Provider value={{ state, actions }}>
      {children}
    </TraceContext.Provider>
  );
};
