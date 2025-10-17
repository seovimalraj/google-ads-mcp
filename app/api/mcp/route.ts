import { NextRequest, NextResponse } from 'next/server';
import { invokeTool, listTools, resolveStatusCode } from '@/lib/mcp';

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
