import { NextRequest, NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { assertEnv } from '@/lib/schemas';

export const runtime = 'nodejs';

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = ['https://www.googleapis.com/auth/adwords'];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const userId = searchParams.get('userId');
  const customerId = searchParams.get('customerId');

  if (!userId || !customerId) {
    return NextResponse.json(
      {
        error: 'userId and customerId are required query parameters.',
      },
      { status: 400 },
    );
  }

  const env = assertEnv();
  const baseUrl = process.env.NEXTAUTH_URL || origin;
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/auth/callback`;
  const statePayload = JSON.stringify({ userId, customerId, ts: Date.now() });
  const state = encrypt(statePayload);

  const params = new URLSearchParams({
    client_id: env.GADS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const consentUrl = `${GOOGLE_AUTH_BASE}?${params.toString()}`;
  return NextResponse.redirect(consentUrl);
}
