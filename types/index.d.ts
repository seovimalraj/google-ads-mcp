export interface ToolError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ToolSuccess<T = unknown> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ToolFailure {
  ok: false;
  error: ToolError;
}

export type ToolResponse<T = unknown> = ToolSuccess<T> | ToolFailure;
