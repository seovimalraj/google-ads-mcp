# Google Search MCP Server

A Next.js App Router deployment that exposes a [Model Context Protocol (MCP)](https://platform.openai.com/docs/mcp/overview)
server focused on organic search research. The server provides two tools—`get_autocomplete_suggestions` and `get_trend_index`—
built on top of Google Suggest and Google Trends. No OAuth credentials are required; both tools rely on public endpoints with
careful validation and rate limiting.

## Features

- **Google Autocomplete**: Expands up to three seed queries into the real phrases Google users type right now.
- **Google Trends**: Returns interest-over-time indices for up to three keywords with optional geo and category filters.
- **Next.js 15 App Router** with strict TypeScript, ESLint, and Prettier configuration.
- **Structured MCP responses** with consistent error handling and lightweight rate limiting.

## Requirements

- Node.js 18.18 or newer.
- `pnpm` or `npm` for dependency management.

## Getting started locally

```bash
pnpm install
pnpm dev
```

The development server defaults to `http://localhost:3000`.

## MCP tools

All tools share the same POST endpoint: `POST /api/mcp` with JSON payload `{"tool": "<name>", "input": { ... } }`. Responses
follow the `ToolResponse` shape (`{ ok: true, data }` or `{ ok: false, error }`).

The server also understands the [MCP Streamable HTTP JSON-RPC envelope](https://modelcontextprotocol.io/specification/latest),
so agents that negotiate with `initialize`, `tools/list`, and `tools/call` will work without any proxy layer. The legacy JSON
format shown below remains supported for quick manual testing.

### `ping`

```json
{
  "tool": "ping"
}
```

Result:

```json
{
  "ok": true,
  "data": { "status": "ok" }
}
```

### `get_autocomplete_suggestions`

Fetches live suggestions from Google Suggest. You can continue sending a single `query` or batch up to three with the `queries`
array.

```json
{
  "tool": "get_autocomplete_suggestions",
  "input": { "queries": ["toroidal transformer", "toroidal core"] }
}
```

Result:

```json
{
  "ok": true,
  "data": {
    "queries": ["toroidal transformer", "toroidal core"],
    "results": [
      {
        "query": "toroidal transformer",
        "suggestions": [
          "toroidal transformer winding",
          "toroidal transformer core"
        ]
      },
      {
        "query": "toroidal core",
        "suggestions": ["toroidal core material", "toroidal core design"]
      }
    ],
    "combinedSuggestions": [
      "toroidal transformer winding",
      "toroidal transformer core",
      "toroidal core material",
      "toroidal core design"
    ]
  }
}
```

### `get_trend_index`

Returns Google Trends interest-over-time data. Optional fields (`geo`, `timeRange`, `category`, `property`) map directly to the
underlying Trends API. Provide `keyword` for backwards compatibility or batch up to three terms with `keywords`.

```json
{
  "tool": "get_trend_index",
  "input": {
    "keywords": ["toroidal transformer", "toroidal core"],
    "timeRange": "today 12-m",
    "geo": "US"
  }
}
```

Result (truncated):

```json
{
  "ok": true,
  "data": {
    "keyword": "toroidal transformer",
    "keywords": ["toroidal transformer", "toroidal core"],
    "geo": "US",
    "timeRange": "today 12-m",
    "seriesLabels": ["toroidal transformer", "toroidal core"],
    "averages": [42, 18],
    "points": [
      {
        "time": "1704067200",
        "formattedTime": "Dec 31, 2023",
        "values": [37, 12]
      }
    ]
  }
}
```

## Advanced Google data sources to explore

Looking to extend the MCP server further? Google exposes several additional surfaces that complement autocomplete and Trends:

- **Search Console API**: Pull verified site performance data (clicks, impressions, CTR) to validate organic opportunities.
- **People Also Ask / Related Searches**: Scrape or proxy the SERP modules for question-driven keyword ideation.
- **Google Ads Keyword Planner**: Estimate paid search volume, bid ranges, and competition scores when you have Ads access.
- **Google Discover and News trends**: Track emerging stories for content roadmaps using the Discover feed and Google News APIs.
- **Google Analytics Data API**: Blend on-site engagement metrics with keyword demand to prioritise high-impact opportunities.

## Rate limiting & errors

- **Rate limiting**: 10 requests per minute per IP/user agent combination. Exceeding the budget returns `429` with
  `code: RATE_LIMIT_EXCEEDED`.
- **Upstream issues**: Failures from Google endpoints map to `UPSTREAM_ERROR` with the HTTP status and service name.
- **Validation errors**: Invalid input payloads return `INVALID_ARGUMENT` and include Zod field errors.
- **Unexpected failures**: Return `500` with `code: UNKNOWN` but never leak secrets.

## ChatGPT Developer Mode integration

Add a remote MCP server in ChatGPT using the following configuration:

- **Server URL**: `https://<your-app>.vercel.app/api/mcp`
- **Tools**: Automatically discovered (`ping`, `get_autocomplete_suggestions`, `get_trend_index`).
- **Auth flow**: None required—both tools rely on public Google endpoints.

Example invocation in ChatGPT:

```json
{
  "tool": "get_trend_index",
  "input": { "keyword": "toroidal transformer" }
}
```

Expect a JSON payload with interest-over-time points that you can combine with autocomplete suggestions to build keyword
clusters or validate seasonal demand.

## Troubleshooting

| Symptom               | Resolution                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `RATE_LIMIT_EXCEEDED` | Wait until the window resets (~60 seconds) or reduce tool frequency.            |
| `UPSTREAM_ERROR`      | Google responded with an error status. Retry later or adjust the query/filters. |
| `UNKNOWN`             | Check server logs for the underlying exception.                                 |

## Acceptance checklist

- [x] Autocomplete MCP tool returning Google Suggest phrases.
- [x] Trends MCP tool returning interest-over-time data.
- [x] README covering setup, usage, and troubleshooting.
