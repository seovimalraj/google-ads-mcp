import { NextRequest, NextResponse } from 'next/server';
import { invokeTool, listTools, resolveStatusCode } from '@/lib/mcp';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonWithCors<T>(body: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

export const runtime = 'nodejs';

export async function GET() {
  return jsonWithCors({
    status: 'ok',
    tools: listTools(),
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonWithCors(
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
    return jsonWithCors(
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

  if (!payload || typeof payload !== 'object') {
    return jsonWithCors(
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
    return jsonWithCors(
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
  return jsonWithCors(response, { status });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
