import { NextRequest, NextResponse } from 'next/server';
import {
  invokeTool,
  listTools,
  listToolMetadata,
  resolveStatusCode,
  toMcpCallToolResult,
  ToolName,
} from '@/lib/mcp';
import {
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  JSONRPC_VERSION,
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_INFO = {
  name: 'google-search-mcp',
  version: '0.2.0',
};

const SERVER_CAPABILITIES = {
  tools: {},
};

const SERVER_INSTRUCTIONS =
  'Tools expose Google Search Console keyword clusters plus Google Autocomplete and Google Trends data. Use get_keyword_clusters for content planning, get_autocomplete_suggestions to expand a query, and get_trend_index to retrieve interest over time.';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    tools: listTools(),
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Content-Type must be application/json.',
        },
      },
      { status: 415 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Request body must be valid JSON.',
        },
      },
      { status: 400 },
    );
  }

  if (isJsonRpcPayload(payload)) {
    return handleJsonRpc(request, payload);
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Payload must include tool and input fields.',
        },
      },
      { status: 400 },
    );
  }

  const { tool, input } = payload as { tool?: string; input?: unknown };
  if (!tool) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'tool is required in the payload.',
        },
      },
      { status: 400 },
    );
  }

  const context = {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.ip || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  };

  const response = await invokeTool(tool, input, context);
  const status = resolveStatusCode(response);
  return NextResponse.json(response, { status });
}

type JsonValue = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcMessage(candidate: unknown): boolean {
  return isPlainObject(candidate) && candidate.jsonrpc === JSONRPC_VERSION;
}

function isJsonRpcPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some((item) => isJsonRpcMessage(item));
  }
  return isJsonRpcMessage(payload);
}

async function handleJsonRpc(request: NextRequest, payload: unknown): Promise<NextResponse> {
  const messages = Array.isArray(payload) ? payload : [payload];
  const responses: JsonValue[] = [];
  let hasRequest = false;

  for (const rawMessage of messages) {
    if (!isJsonRpcMessage(rawMessage)) {
      responses.push(buildJsonRpcError(null, -32600, 'Invalid Request'));
      hasRequest = true;
      continue;
    }

    const idValue =
      'id' in rawMessage ? (rawMessage.id as string | number | null | undefined) : undefined;
    if (
      idValue !== undefined &&
      idValue !== null &&
      typeof idValue !== 'string' &&
      typeof idValue !== 'number'
    ) {
      responses.push(buildJsonRpcError(null, -32600, 'Invalid Request'));
      hasRequest = true;
      continue;
    }

    const method = typeof rawMessage.method === 'string' ? rawMessage.method : null;
    if (!method) {
      responses.push(buildJsonRpcError(idValue ?? null, -32600, 'Invalid Request'));
      hasRequest = true;
      continue;
    }

    const params = 'params' in rawMessage ? rawMessage.params : undefined;

    if (idValue === undefined) {
      // Notification – respond with 202 later, but still allow initialize acknowledgement.
      continue;
    }

    hasRequest = true;
    responses.push(await dispatchJsonRpcRequest(request, method, params, idValue ?? null));
  }

  if (!hasRequest) {
    return new NextResponse(null, {
      status: 202,
      headers: {
        'mcp-protocol-version': DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      },
    });
  }

  const body = responses.length === 1 ? responses[0] : responses;
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'mcp-protocol-version': DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
    },
  });
}

async function dispatchJsonRpcRequest(
  request: NextRequest,
  method: string,
  params: unknown,
  id: string | number | null,
): Promise<JsonValue> {
  switch (method) {
    case 'initialize':
      return buildJsonRpcResult(id, {
        protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    case 'tools/list':
      return buildJsonRpcResult(id, {
        tools: listToolMetadata(),
      });
    case 'tools/call': {
      if (!isPlainObject(params) || typeof params.name !== 'string') {
        return buildJsonRpcError(id, -32602, 'Invalid params: name is required.');
      }

      const toolArguments = (params as JsonValue)['arguments'];
      if (
        toolArguments !== undefined &&
        toolArguments !== null &&
        (typeof toolArguments !== 'object' || Array.isArray(toolArguments))
      ) {
        return buildJsonRpcError(id, -32602, 'Invalid params: arguments must be an object.');
      }

      const context = {
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.ip || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      };

      const invocationInput = (toolArguments as Record<string, unknown> | undefined) ?? undefined;
      const toolName = params.name as ToolName;
      const response = await invokeTool(toolName, invocationInput, context);
      const callResult = toMcpCallToolResult(response, toolName);
      const result: JsonValue = {
        content: callResult.content,
        ...(callResult.structuredContent
          ? { structuredContent: callResult.structuredContent }
          : {}),
        ...(callResult.isError ? { isError: true } : {}),
        ...(callResult._meta ? { _meta: callResult._meta } : {}),
      };
      return buildJsonRpcResult(id, result);
    }
    case 'ping':
      return buildJsonRpcResult(id, {});
    default:
      return buildJsonRpcError(id, -32601, `Method ${method} not found.`);
  }
}

function buildJsonRpcResult(id: string | number | null, result: JsonValue): JsonValue {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function buildJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonValue {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}
