import type { RunResult, EvalConfig } from '../lib/types';

// API base URL (configured for development)
const API_BASE_URL = 'http://localhost:8000/api';

/**
 * Convert snake_case Python response to camelCase TypeScript types
 */
function convertSnakeToCamel(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertSnakeToCamel);
  }

  if (obj !== null && typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      converted[camelKey] = convertSnakeToCamel(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Evaluate traces using the Python backend API
 *
 * @param traceFiles - Array of trace files (Jaeger JSON)
 * @param evalSetFile - Optional eval set file
 * @param config - Evaluation configuration
 * @returns RunResult with trace results and errors
 */
export async function evaluateTracesAPI(
  traceFiles: File[],
  evalSetFile: File | null,
  config: EvalConfig
): Promise<RunResult> {
  const formData = new FormData();

  traceFiles.forEach(file => {
    formData.append('trace_files', file);
  });

  if (evalSetFile) {
    formData.append('eval_set_file', evalSetFile);
  }

  formData.append('config', JSON.stringify(config));

  try {
    const response = await fetch(`${API_BASE_URL}/evaluate`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        // Fallback to statusText if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const converted = convertSnakeToCamel(data) as RunResult;

    return converted;

  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred while evaluating traces');
  }
}

/**
 * List available metrics from the backend
 */
export async function listMetrics() {
  try {
    const response = await fetch(`${API_BASE_URL}/metrics`);

    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to list metrics:', error);
    throw error;
  }
}

/**
 * Validate an eval set file
 */
export async function validateEvalSet(evalSetFile: File) {
  const formData = new FormData();
  formData.append('eval_set_file', evalSetFile);

  try {
    const response = await fetch(`${API_BASE_URL}/validate/eval-set`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to validate eval set: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to validate eval set:', error);
    throw error;
  }
}

/**
 * Health check
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}
