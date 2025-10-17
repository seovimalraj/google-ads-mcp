export interface AuthToken {
  userId: string;
  customerId: string;
  refreshTokenEnc: string;
  createdAt: string;
  updatedAt: string;
}

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
