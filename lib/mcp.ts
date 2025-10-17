import { z, ZodDefault, ZodEffects, ZodNullable, ZodObject, ZodOptional } from 'zod';
import type { ToolError, ToolResponse } from '@/types';
import { decrypt, EncryptionError } from './crypto';
import { getAuthToken, kvStatus } from './kv';
import { keywordIdeas, historicalMetrics, forecast, AdsApiError } from './ads';
import {
  forecastInputSchema,
  historicalMetricsInputSchema,
  keywordIdeasInputSchema,
  type ForecastInput,
  type HistoricalMetricsInput,
  type KeywordIdeasInput,
} from './schemas';
import { consumeRateLimit } from './ratelimit';

type ToolName = 'get_keyword_ideas' | 'get_historical_metrics' | 'get_forecast' | 'ping';

interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput> {
  name: ToolName;
  description: string;
  schema: TInput;
  handler: (input: z.infer<TInput>, context: InvocationContext) => Promise<ToolResponse<TOutput>>;
}

interface InvocationContext {
  ip?: string;
  userAgent?: string;
}

const rateLimitCodes: Record<string, number> = {
  RATE_LIMIT_EXCEEDED: 429,
  QUOTA_EXCEEDED: 429,
  INVALID_ARGUMENT: 400,
  BAD_REQUEST: 400,
  AUTHENTICATION_ERROR: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
};

const toolCatalog: ToolDefinition<z.ZodTypeAny, unknown>[] = [
  {
    name: 'ping',
    description: 'Health check to confirm the MCP server is reachable.',
    schema: z.object({ userId: z.string().optional() }).optional(),
    handler: async (_input, context) => {
      const kvMode = kvStatus();
      return {
        ok: true,
        data: {
          status: 'ok',
          kv: kvMode ?? 'unknown',
        },
        meta: {
          ip: context.ip,
        },
      };
    },
  },
  {
    name: 'get_keyword_ideas',
    description: 'Retrieve keyword ideas from the Google Ads Keyword Planner API.',
    schema: keywordIdeasInputSchema,
    handler: async (input, context) =>
      handleAdsTool('get_keyword_ideas', input, context, keywordIdeas),
  },
  {
    name: 'get_historical_metrics',
    description:
      'Fetch keyword historical metrics such as average monthly searches and bid ranges.',
    schema: historicalMetricsInputSchema,
    handler: async (input, context) =>
      handleAdsTool('get_historical_metrics', input, context, historicalMetrics),
  },
  {
    name: 'get_forecast',
    description: 'Generate campaign forecasts for the supplied keyword set.',
    schema: forecastInputSchema,
    handler: async (input, context) => handleAdsTool('get_forecast', input, context, forecast),
  },
];

interface HeadersLike {
  get(name: string): string | null | undefined;
}

interface McpCallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
}

let serverInitialisation: Promise<unknown> | null = null;

async function ensureExternalServer(): Promise<unknown> {
  if (!serverInitialisation) {
    serverInitialisation = (async () => {
      try {
        const mod: any = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const McpServer: any = mod?.McpServer ?? mod?.default?.McpServer;
        if (typeof McpServer === 'function') {
          const server = new McpServer({
            name: 'google-ads-mcp',
            version: '0.1.0',
          });
          if (typeof server?.registerTool === 'function') {
            toolCatalog.forEach((tool) => {
              const inputSchema = getInputSchemaShape(tool.schema);
              server.registerTool(
                tool.name,
                {
                  description: tool.description,
                  ...(inputSchema ? { inputSchema } : {}),
                },
                async (...args: unknown[]) => {
                  const { toolArgs, extra } = extractToolCallbackArgs(args);
                  const context = extractInvocationContext(extra);
                  const response = await invokeTool(tool.name, toolArgs, context);
                  return toCallToolResult(response, tool.name);
                },
              );
            });
          }
          return server;
        }
      } catch (error) {
        console.warn(
          '[mcp] Unable to initialise @modelcontextprotocol/sdk MCP server. Falling back to JSON transport.',
          error,
        );
      }
      return null;
    })();
  }
  return serverInitialisation;
}

void ensureExternalServer();

function getInputSchemaShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  let current: z.ZodTypeAny | undefined = schema;
  while (
    current instanceof ZodOptional ||
    current instanceof ZodNullable ||
    current instanceof ZodDefault
  ) {
    current = current._def.innerType;
  }
  if (current instanceof ZodEffects) {
    current = current._def.schema;
  }
  if (current instanceof ZodObject) {
    return current._def.shape();
  }
  return undefined;
}

function extractToolCallbackArgs(args: unknown[]): { toolArgs: unknown; extra: unknown } {
  if (args.length === 0) {
    return { toolArgs: undefined, extra: undefined };
  }
  if (args.length === 1) {
    return { toolArgs: undefined, extra: args[0] };
  }
  return { toolArgs: args[0], extra: args[1] };
}

function extractInvocationContext(extra: unknown): InvocationContext {
  const headers = extractHeaders(extra);
  const forwardedFor = headers?.get('x-forwarded-for') ?? headers?.get('x-real-ip');
  const userAgent = headers?.get('user-agent') ?? undefined;
  return {
    ip: pickFirstIp(forwardedFor),
    userAgent: userAgent ?? undefined,
  };
}

function extractHeaders(extra: unknown): HeadersLike | undefined {
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const requestInfo = (extra as { requestInfo?: { headers?: unknown } }).requestInfo;
  const headers = requestInfo?.headers;
  if (!headers) {
    return undefined;
  }
  if (typeof (headers as HeadersLike).get === 'function') {
    return headers as HeadersLike;
  }
  if (typeof headers === 'object') {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        normalized[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        normalized[key.toLowerCase()] = value.map(String).join(', ');
      }
    }
    return {
      get(name: string) {
        return normalized[name.toLowerCase()] ?? null;
      },
    };
  }
  return undefined;
}

function pickFirstIp(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const first = value.split(',')[0]?.trim();
  return first || undefined;
}

function toCallToolResult(response: ToolResponse, toolName: ToolName): McpCallToolResult {
  if (response.ok) {
    const text =
      typeof response.data === 'string'
        ? response.data
        : (JSON.stringify(response.data, null, 2) ?? 'Success');
    const content: Array<{ type: 'text'; text: string }> = text ? [{ type: 'text', text }] : [];
    const meta = { ...(response.meta ?? {}), tool: toolName };
    const result: McpCallToolResult = {
      content,
      structuredContent: response.data,
      _meta: meta,
    };
    return result;
  }

  const detailsText =
    response.error.details !== undefined ? formatDetails(response.error.details) : null;
  const contentText =
    `[${response.error.code}] ${response.error.message}` +
    (detailsText ? `\nDetails: ${detailsText}` : '');
  return {
    content: [{ type: 'text', text: contentText }],
    isError: true,
    _meta: { tool: toolName, error: response.error },
  };
}

function formatDetails(details: unknown): string {
  if (typeof details === 'string') {
    return details;
  }
  try {
    const serialized = JSON.stringify(details, null, 2);
    return serialized ?? String(details);
  } catch {
    return String(details);
  }
}

async function handleAdsTool<
  TInput extends KeywordIdeasInput | HistoricalMetricsInput | ForecastInput,
  TResult,
>(
  tool: Extract<ToolName, 'get_keyword_ideas' | 'get_historical_metrics' | 'get_forecast'>,
  input: TInput,
  context: InvocationContext,
  executor: (args: TInput & { refreshToken: string }) => Promise<TResult>,
): Promise<ToolResponse<TResult>> {
  const rateKey = input.userId ?? context.ip ?? 'anonymous';
  const rate = consumeRateLimit(`tool:${tool}:${rateKey}`);
  if (!rate.success) {
    return {
      ok: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please retry later.',
        details: {
          limit: rate.limit,
          remaining: rate.remaining,
          reset: rate.reset,
        },
      },
    };
  }

  try {
    const tokenRecord = await getAuthToken(input.userId);
    if (!tokenRecord) {
      return {
        ok: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'No refresh token found for the supplied userId. Complete the OAuth flow.',
        },
      };
    }

    let refreshToken: string;
    try {
      refreshToken = decrypt(tokenRecord.refreshTokenEnc);
    } catch (error) {
      if (error instanceof EncryptionError) {
        return {
          ok: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Stored credentials are corrupted or encrypted with a different key.',
            details: { cause: error.message },
          },
        };
      }
      throw error;
    }

    const started = Date.now();
    const data = await executor({ ...input, refreshToken });
    const duration = Date.now() - started;

    log('info', `${tool} success`, {
      userId: input.userId,
      customerId: input.customerId,
      duration,
      ip: context.ip,
      tool,
    });

    return {
      ok: true,
      data,
      meta: {
        durationMs: duration,
        rateLimit: {
          limit: rate.limit,
          remaining: rate.remaining,
          reset: rate.reset,
        },
      },
    };
  } catch (error) {
    const toolError = toToolError(error);
    log('error', `${tool} failure`, {
      userId: input.userId,
      customerId: input.customerId,
      tool,
      code: toolError.code,
      message: toolError.message,
      details: toolError.details,
    });
    return {
      ok: false,
      error: toolError,
    };
  }
}

function toToolError(error: unknown): ToolError {
  if (error instanceof AdsApiError) {
    const normalized = normalizeErrorCode(error.code);
    return {
      code: normalized,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: 'INVALID_ARGUMENT',
      message: 'Input validation failed.',
      details: error.flatten(),
    };
  }
  if (error instanceof EncryptionError) {
    return {
      code: 'AUTHENTICATION_ERROR',
      message: error.message,
    };
  }
  const message = error instanceof Error ? error.message : 'Unexpected error occurred.';
  return {
    code: 'UNKNOWN',
    message,
  };
}

function normalizeErrorCode(code: string): string {
  const normalized = code?.toUpperCase() ?? 'UNKNOWN';
  if (normalized.includes('AUTH')) {
    return 'AUTHENTICATION_ERROR';
  }
  if (normalized.includes('PERMISSION')) {
    return 'PERMISSION_DENIED';
  }
  if (normalized.includes('QUOTA') || normalized.includes('RATE')) {
    return 'QUOTA_EXCEEDED';
  }
  if (normalized.includes('ARGUMENT') || normalized.includes('INVALID')) {
    return 'INVALID_ARGUMENT';
  }
  if (normalized.includes('NOT_FOUND')) {
    return 'NOT_FOUND';
  }
  return normalized || 'UNKNOWN';
}

function log(level: 'info' | 'error', message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error('[mcp]', payload);
  } else {
    console.log('[mcp]', payload);
  }
}

export function listTools(): Array<{ name: ToolName; description: string }> {
  return toolCatalog.map((tool) => ({ name: tool.name, description: tool.description }));
}

export async function invokeTool(
  toolName: string,
  input: unknown,
  context: InvocationContext,
): Promise<ToolResponse> {
  const tool = toolCatalog.find((entry) => entry.name === toolName);
  if (!tool) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: `Tool ${toolName} is not registered.`,
      },
    };
  }

  if (tool.schema) {
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'Input validation failed.',
          details: parsed.error.flatten(),
        },
      };
    }
    return tool.handler(parsed.data, context);
  }

  return tool.handler(input, context);
}

export function resolveStatusCode(response: ToolResponse): number {
  if (response.ok) {
    return 200;
  }
  return rateLimitCodes[response.error.code] ?? 500;
}
