import { z, ZodDefault, ZodEffects, ZodNullable, ZodObject, ZodOptional } from 'zod';
import type { ToolError, ToolResponse } from '@/types';
import { fetchAutocompleteSuggestions, fetchTrendIndex, UpstreamError } from './search';
import {
  autocompleteInputSchema,
  keywordClustersInputSchema,
  trendIndexInputSchema,
} from './schemas';
import { getKeywordClusters } from '@/src/tools/get_keyword_clusters';
import { consumeRateLimit } from './ratelimit';

type JsonSchemaObject = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  [key: string]: unknown;
};

export type ToolName =
  | 'ping'
  | 'get_autocomplete_suggestions'
  | 'get_trend_index'
  | 'get_keyword_clusters';

interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput> {
  name: ToolName;
  description: string;
  schema: TInput;
  handler: (input: z.infer<TInput>, context: InvocationContext) => Promise<ToolResponse<TOutput>>;
  inputJsonSchema: JsonSchemaObject;
}

interface InvocationContext {
  ip?: string;
  userAgent?: string;
}

interface RateLimitMeta {
  limit: number;
  remaining: number;
  reset: number;
}

const rateLimitCodes: Record<string, number> = {
  RATE_LIMIT_EXCEEDED: 429,
  INVALID_ARGUMENT: 400,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
};

const toolCatalog: ToolDefinition<z.ZodTypeAny, unknown>[] = [
  {
    name: 'ping',
    description: 'Health check to confirm the MCP server is reachable.',
    schema: z.object({}).optional(),
    inputJsonSchema: {
      type: 'object',
      description: 'No arguments are required for the ping tool.',
      properties: {},
      additionalProperties: false,
    },
    handler: async (_input, context) => ({
      ok: true,
      data: {
        status: 'ok',
      },
      meta: {
        ip: context.ip,
      },
    }),
  },
  {
    name: 'get_autocomplete_suggestions',
    description: 'Return Google Autocomplete suggestions for the provided query.',
    schema: autocompleteInputSchema,
    inputJsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Search phrase to expand using Google Autocomplete.',
        },
        keyword: {
          type: 'string',
          description: 'Single keyword alias for query.',
        },
        queries: {
          type: 'array',
          items: {
            type: 'string',
          },
          minItems: 1,
          maxItems: 3,
          description: 'Batch up to three phrases to fetch suggestions in a single call.',
        },
        keywords: {
          oneOf: [
            {
              type: 'array',
              items: {
                type: 'string',
              },
              minItems: 1,
              maxItems: 3,
            },
            {
              type: 'string',
            },
          ],
          description: 'Keyword alias for query/queries inputs.',
        },
      },
      oneOf: [
        { required: ['query'] },
        { required: ['queries'] },
        { required: ['keyword'] },
        { required: ['keywords'] },
      ],
    },
    handler: async (input, context) =>
      executeWithRateLimit(
        'get_autocomplete_suggestions',
        context,
        async () => {
          const results = await Promise.all(
            input.queries.map((query: string) => fetchAutocompleteSuggestions(query)),
          );
          const combinedSuggestions = Array.from(
            new Set(results.flatMap((result) => result.suggestions)),
          );
          if (results.length === 1) {
            const [first] = results;
            return {
              query: first.query,
              suggestions: first.suggestions,
              queries: input.queries,
              results,
              combinedSuggestions,
            };
          }
          return {
            queries: input.queries,
            results,
            combinedSuggestions,
          };
        },
        input.queries.length,
      ),
  },
  {
    name: 'get_trend_index',
    description: 'Fetch Google Trends interest-over-time data for the supplied keyword.',
    schema: trendIndexInputSchema,
    inputJsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        keyword: {
          type: 'string',
          description: 'Primary search term to query in Google Trends.',
        },
        keywords: {
          oneOf: [
            {
              type: 'array',
              items: {
                type: 'string',
              },
              minItems: 1,
              maxItems: 3,
            },
            {
              type: 'string',
            },
          ],
          description: 'Compare up to three search terms in a single timeline request.',
        },
        geo: {
          type: 'string',
          description: 'Optional ISO-3166 region code, e.g. US.',
        },
        timeRange: {
          type: 'string',
          description: 'Optional Google Trends time range such as "today 12-m".',
        },
        category: {
          type: 'integer',
          description: 'Optional Google Trends category identifier.',
        },
        property: {
          type: 'string',
          description: 'Optional Google property filter (for example "youtube").',
        },
      },
      oneOf: [{ required: ['keyword'] }, { required: ['keywords'] }],
    },
    handler: async (input, context) =>
      executeWithRateLimit(
        'get_trend_index',
        context,
        async () =>
          fetchTrendIndex({
            keywords: input.keywords,
            geo: input.geo,
            timeRange: input.timeRange,
            category: input.category,
            property: input.property,
          }),
        input.keywords.length,
      ),
  },
  {
    name: 'get_keyword_clusters',
    description:
      'Cluster Search Console queries into actionable groups using token overlap and shared ranked pages.',
    schema: keywordClustersInputSchema,
    inputJsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Optional seed query used to expand candidates with Google Autocomplete.',
        },
        siteUrl: {
          type: 'string',
          description: 'Verified site URL in Google Search Console (include protocol).',
        },
        timeRange: {
          type: 'string',
          description:
            'Date window for Search Console data (for example last_90_days or custom:2024-01-01:2024-03-31).',
          default: 'last_90_days',
        },
        includeAutocomplete: {
          type: 'boolean',
          description: 'Whether to enrich clusters with Google Autocomplete expansions.',
          default: true,
        },
        geo: {
          type: 'string',
          description: 'Geographic code used for context when seeding autocomplete suggestions.',
          default: 'US',
        },
        maxKeywords: {
          type: 'number',
          description: 'Maximum number of normalised keywords to cluster (capped at 5000).',
          default: 2000,
        },
      },
      required: ['siteUrl'],
    },
    handler: async (input, context) =>
      executeWithRateLimit(
        'get_keyword_clusters',
        context,
        async () => getKeywordClusters(input),
        Math.max(1, Math.ceil(input.maxKeywords / 500)),
      ),
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
            name: 'google-search-mcp',
            version: '0.2.0',
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
      ...(typeof response.data === 'object' && response.data !== null
        ? { structuredContent: response.data }
        : {}),
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
    structuredContent: { error: response.error },
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

async function executeWithRateLimit<T>(
  tool: ToolName,
  context: InvocationContext,
  executor: () => Promise<T>,
  weight = 1,
): Promise<ToolResponse<T>> {
  const rateOutcome = applyRateLimit(tool, context, weight);
  if (!rateOutcome.success) {
    return rateOutcome.response;
  }

  try {
    const started = Date.now();
    const data = await executor();
    const duration = Date.now() - started;

    return {
      ok: true,
      data,
      meta: {
        durationMs: duration,
        rateLimit: rateOutcome.meta,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: toToolError(error),
    };
  }
}

function applyRateLimit(
  tool: ToolName,
  context: InvocationContext,
  weight = 1,
): { success: true; meta: RateLimitMeta } | { success: false; response: ToolResponse<never> } {
  const keyParts = [tool, context.ip, context.userAgent].filter(Boolean) as string[];
  const key = keyParts.join(':') || `anonymous:${tool}`;
  const rate = consumeRateLimit(`tool:${key}`, weight);

  if (!rate.success) {
    return {
      success: false,
      response: {
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
      },
    };
  }

  return {
    success: true,
    meta: {
      limit: rate.limit,
      remaining: rate.remaining,
      reset: rate.reset,
    },
  };
}

function toToolError(error: unknown): ToolError {
  if (error instanceof UpstreamError) {
    return {
      code: 'UPSTREAM_ERROR',
      message: error.message,
      details: {
        service: error.service,
        status: error.status,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: 'INVALID_ARGUMENT',
      message: 'Input validation failed.',
      details: error.flatten(),
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: error.message,
    };
  }
  return {
    code: 'UNKNOWN',
    message: 'Unexpected error occurred.',
  };
}

export function listTools(): Array<{ name: ToolName; description: string }> {
  return toolCatalog.map((tool) => ({ name: tool.name, description: tool.description }));
}

export function listToolMetadata(): Array<{
  name: ToolName;
  description: string;
  inputSchema: JsonSchemaObject;
}> {
  return toolCatalog.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputJsonSchema,
  }));
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

export function toMcpCallToolResult(response: ToolResponse, toolName: ToolName): McpCallToolResult {
  return toCallToolResult(response, toolName);
}
