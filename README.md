# Google Ads MCP Server

A Next.js App Router deployment that exposes a [Model Context Protocol (MCP)](https://platform.openai.com/docs/mcp/overview) server backed by the Google Ads Keyword Planner. The server provides three tools—`get_keyword_ideas`, `get_historical_metrics`, and `get_forecast`—with secure OAuth, encrypted credential storage, in-flight validation, and lightweight rate limiting. It is optimised for Vercel (Node.js runtime) but runs locally with the same feature set.

## Features

- **Next.js 15 App Router** using strict TypeScript, ESLint, and Prettier.
- **MCP tools** for keyword discovery, historical metrics, and forecasts.
- **Google OAuth 2.0 flow** with AES-256-GCM encrypted refresh token storage.
- **Redis persistence** via Upstash Redis (or any REST-compatible endpoint) with an automatic in-memory fallback for local development.
- **Zod validation** for every tool input plus environment assertions.
- **Token bucket rate limiting** (10 requests/minute per user/IP).
- **Structured logging & error mapping** for predictable MCP responses.

## Requirements

- Node.js 18.18 or newer (Next.js 15 canary requires ≥18.18).
- `pnpm` or `npm` for dependency management.
- A Google Ads Manager account with API access.
- Google Cloud OAuth client (type: Web application) authorised for the deployment URL.
- Upstash Redis database (or any Redis instance that exposes the Upstash REST API).

## Environment variables

Create a `.env` file (or configure Vercel project secrets) that includes all variables from `.env.example`.

<!-- prettier-ignore -->
| Variable | Required | Description |
|----------|----------|-------------|
| `GADS_CLIENT_ID` | ✅ | OAuth client ID created in Google Cloud Console. |
| `GADS_CLIENT_SECRET` | ✅ | OAuth client secret that matches the client ID. |
| `GADS_DEV_TOKEN` | ✅ | Google Ads developer token approved for production. |
| `GADS_LOGIN_CUSTOMER_ID` | ⚪️ | Optional manager account ID used for scoped access. |
| `ENCRYPTION_KEY` | ✅ | Base64 encoded 32-byte key for AES-256-GCM. Generate with `openssl rand -base64 32`. |
| `REDIS_REST_URL` | ⚪️ | Redis REST endpoint (e.g. Upstash). Equivalent to Vercel's `UPSTASH_REDIS_REST_URL`. |
| `REDIS_REST_TOKEN` | ⚪️ | Redis REST token with read/write permissions. Equivalent to `UPSTASH_REDIS_REST_TOKEN`. |
| `UPSTASH_REDIS_REST_URL` | ⚪️ | Alternative env key automatically provided by Vercel / Upstash. |
| `UPSTASH_REDIS_REST_TOKEN` | ⚪️ | Alternative env key automatically provided by Vercel / Upstash. |
| `NEXT_PUBLIC_APP_NAME` | ✅ | Display name shown on the OAuth confirmation page. |
| `NEXTAUTH_URL` | ⚪️ | Optional explicit base URL. When omitted the server uses the incoming request origin. |

> ℹ️ If any required variable is missing the server throws an explicit error at startup, ensuring you see actionable messages in local development and on Vercel logs.

## Project structure

```
app/
  api/
    auth/
      start/route.ts        # Initiates Google OAuth consent
      callback/route.ts     # Handles OAuth callback and refresh token storage
    mcp/route.ts            # MCP endpoint (GET health, POST invoke)
lib/
  ads.ts                   # Google Ads client and helpers
  crypto.ts                # AES-256-GCM encrypt/decrypt utilities
  kv.ts                    # Redis (Upstash) / in-memory abstraction
  mcp.ts                   # Tool registration, validation, rate limiting
  ratelimit.ts             # Simple token-bucket implementation
  schemas.ts               # Zod schemas for env + tool payloads
 types/index.d.ts          # Shared TypeScript types (ToolResponse, AuthToken)
```

## Getting started locally

```bash
pnpm install
pnpm dev
```

The development server defaults to `http://localhost:3000`. Ensure your Google OAuth client has that origin and callback (`http://localhost:3000/api/auth/callback`) added to the authorised redirect URIs.

### Running without Redis

If `REDIS_REST_URL`/`REDIS_REST_TOKEN` (or the Upstash equivalents) are missing the server logs a warning and stores tokens in-memory. This is ideal for local testing but **not** for production because refresh tokens will be lost on redeploys.

## OAuth flow

1. Direct the browser (or an HTTP client) to `/api/auth/start?userId=<USER>&customerId=<CUSTOMER_ID>`.
2. Google prompts for consent with the `https://www.googleapis.com/auth/adwords` scope.
3. On success Google redirects to `/api/auth/callback`. The server exchanges the code for tokens, encrypts the refresh token with AES-256-GCM, and persists it in Redis.
4. The callback endpoint renders a simple confirmation page. Tokens are now available to all MCP tools via the stored `userId`.

The `state` parameter is encrypted to prevent tampering and includes the user/customer IDs plus a timestamp.

## MCP tools

All tools share the same POST endpoint: `POST /api/mcp` with JSON payload `{"tool": "<name>", "input": { ... } }`. Responses follow the `ToolResponse` shape (`{ ok: true, data }` or `{ ok: false, error }`).

### `ping`

```json
{
  "tool": "ping",
  "input": { "userId": "demo" }
}
```

Result:

```json
{
  "ok": true,
  "data": { "status": "ok", "kv": "redis" },
  "meta": { "ip": "127.0.0.1" }
}
```

### `get_keyword_ideas`

```json
{
  "tool": "get_keyword_ideas",
  "input": {
    "userId": "demo",
    "customerId": "1234567890",
    "keywords": ["toroidal transformer"],
    "locationIds": ["2356"],
    "languageId": "1000",
    "network": "GOOGLE_SEARCH_AND_PARTNERS",
    "pageSize": 30
  }
}
```

### `get_historical_metrics`

```json
{
  "tool": "get_historical_metrics",
  "input": {
    "userId": "demo",
    "customerId": "1234567890",
    "keywords": ["toroidal transformer"],
    "locationIds": ["2356"],
    "languageId": "1000"
  }
}
```

### `get_forecast`

```json
{
  "tool": "get_forecast",
  "input": {
    "userId": "demo",
    "customerId": "1234567890",
    "keywords": ["toroidal transformer"],
    "locationIds": ["2356"],
    "languageId": "1000",
    "cpcBidMicros": 1500000,
    "dailyBudgetMicros": 2500000
  }
}
```

All tool inputs are validated by Zod. Errors return HTTP 400 and a structured payload:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "Input validation failed.",
    "details": {
      "fieldErrors": { "keywords": ["Provide either keywords[] or urlSeed."] }
    }
  }
}
```

## Rate limiting & errors

- **Rate limiting**: 10 requests per minute per user (falls back to IP if userId missing). Exceeding the budget returns `429` with `code: RATE_LIMIT_EXCEEDED`.
- **Authentication errors**: Missing or corrupt refresh tokens map to `AUTHENTICATION_ERROR` (HTTP 401).
- **Permission issues**: Google Ads permission denials map to `PERMISSION_DENIED` (HTTP 403).
- **Quota problems**: API quota issues map to `QUOTA_EXCEEDED` (HTTP 429).
- **Unexpected failures**: Return `500` with `code: UNKNOWN` but never leak secrets.

Structured logs (via `console.log` / `console.error`) include tool name, user ID, duration, and error codes to help diagnose incidents quickly.

## Deployment on Vercel

1. Push the repository to GitHub and create a Vercel project targeting this repo.
2. Set the production environment variables listed above. Remember to generate a strong `ENCRYPTION_KEY` and configure Redis credentials.
3. Deploy. Vercel automatically builds the Next.js app in the Node.js runtime.
4. After deployment, run the OAuth flow (`https://<app>.vercel.app/api/auth/start?...`) and confirm the callback stores the token (check logs or `/api/mcp` ping).
5. Smoke test each tool with `curl` or the MCP client using the production URL.

## ChatGPT Developer Mode integration

Add a remote MCP server in ChatGPT using the following configuration:

- **Server URL**: `https://<your-app>.vercel.app/api/mcp`
- **Tools**: Automatically discovered (`ping`, `get_keyword_ideas`, `get_historical_metrics`, `get_forecast`).
- **Auth flow**: Run `/api/auth/start` in a browser **before** invoking any tool so the refresh token is available.

Example invocation in ChatGPT (after auth):

```json
{
  "tool": "get_keyword_ideas",
  "input": {
    "userId": "demo",
    "customerId": "1234567890",
    "keywords": ["toroidal transformer"],
    "locationIds": ["2356"],
    "languageId": "1000"
  }
}
```

Expect a JSON array of keyword ideas with text, competition, and bid ranges.

## Troubleshooting

<!-- prettier-ignore -->
| Symptom | Resolution |
|---------|------------|
| `Invalid environment configuration` error on boot | Verify `.env` matches `.env.example` and the encryption key is 32 bytes base64. |
| `/api/auth/start` returns 400 | Both `userId` and `customerId` must be present in the query string. |
| Google callback lacks `refresh_token` | Ensure you append `prompt=consent&access_type=offline` (the start endpoint does this automatically). Remove the app from Google account permissions and retry. |
| MCP tools return `AUTHENTICATION_ERROR` | The stored refresh token may be corrupted or encrypted with an old key. Regenerate `ENCRYPTION_KEY`, re-run OAuth, and redeploy. |
| `RATE_LIMIT_EXCEEDED` | Wait until the window resets (~60 seconds) or reduce tool frequency. |
| `PERMISSION_DENIED` from Google | Confirm the user has access to the specified `customerId` and the developer token is approved. |

## Acceptance checklist

- [x] App Router structure with TypeScript, ESLint, Prettier, and strict mode.
- [x] OAuth start/callback routes using AES-256-GCM encrypted refresh tokens.
- [x] Redis abstraction with Upstash + in-memory modes.
- [x] Google Ads helpers for keyword ideas, historical metrics, and forecasts.
- [x] MCP tools with validation, rate limiting, and error handling.
- [x] README covering setup, usage, deployment, and troubleshooting.

## Build Fix Notes

### ESLint/Prettier

- Installed: eslint, prettier, eslint-plugin-prettier, eslint-config-prettier, @typescript-eslint/parser, @typescript-eslint/eslint-plugin.
- .eslintrc.cjs uses `plugin:prettier/recommended`.

### Google Ads Client

- Use `customer_id` (snake_case) in CustomerOptions.
- Keep other options snake_case: `login_customer_id`, `refresh_token`.

### Telemetry

- Optional: set `NEXT_TELEMETRY_DISABLED=1` to silence logs.

### Commands

- `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build`.
