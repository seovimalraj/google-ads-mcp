import { NextRequest, NextResponse } from 'next/server';
import { decrypt, encrypt } from '@/lib/crypto';
import { setAuthToken } from '@/lib/kv';
import { assertEnv } from '@/lib/schemas';

export const runtime = 'nodejs';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const error = url.searchParams.get('error');
  if (error) {
    const errorDescription = url.searchParams.get('error_description');
    return NextResponse.json(
      {
        ok: false,
        error,
        error_description: errorDescription,
      },
      { status: 400 },
    );
  }

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Missing code or state parameter.',
      },
      { status: 400 },
    );
  }

  let state: { userId: string; customerId: string };
  try {
    const decoded = decrypt(stateParam);
    state = JSON.parse(decoded) as { userId: string; customerId: string };
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid state parameter.',
        details: err instanceof Error ? err.message : undefined,
      },
      { status: 400 },
    );
  }

  const env = assertEnv();
  const baseUrl = process.env.NEXTAUTH_URL || url.origin;
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/auth/callback`;
  const tokenParams = new URLSearchParams({
    code,
    client_id: env.GADS_CLIENT_ID,
    client_secret: env.GADS_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    const payload = await tokenResponse.text();
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to exchange authorization code.',
        details: payload,
      },
      { status: 502 },
    );
  }

  const tokens = (await tokenResponse.json()) as {
    refresh_token?: string;
    refreshToken?: string;
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const refreshToken = tokens.refresh_token ?? tokens.refreshToken;
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Google did not return a refresh_token. Ensure "access_type=offline" and "prompt=consent" are used on the start endpoint.',
      },
      { status: 400 },
    );
  }

  const encryptedRefresh = encrypt(refreshToken);
  await setAuthToken({
    userId: state.userId,
    customerId: state.customerId,
    refreshTokenEnc: encryptedRefresh,
  });

  const html = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${env.NEXT_PUBLIC_APP_NAME ?? 'Ads MCP'} Connected</title>
      <style>
        body { font-family: sans-serif; padding: 2rem; background: #f7f7f7; color: #111; }
        main { max-width: 480px; margin: auto; background: #fff; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { margin: 0.25rem 0; }
        code { background: #f1f1f1; padding: 0.2rem 0.3rem; border-radius: 4px; }
      </style>
    </head>
    <body>
      <main>
        <h1>Connected</h1>
        <p>${env.NEXT_PUBLIC_APP_NAME ?? 'Ads MCP'} is now authorized for user <code>${state.userId}</code>.</p>
        <p>You may close this window and return to the MCP client.</p>
      </main>
    </body>
  </html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
