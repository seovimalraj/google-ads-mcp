# Google Search MCP Server

A Next.js App Router deployment that exposes a [Model Context Protocol (MCP)](https://platform.openai.com/docs/mcp/overview)
server focused on organic search research. The server provides three tools—`get_autocomplete_suggestions`, `get_trend_index`,
and `get_keyword_clusters`—built on top of Google Suggest, Google Trends, and Search Console. Autocomplete and Trends rely on
public endpoints, while clustering authenticates with a Search Console service account.

## Features

- **Google Autocomplete**: Expands up to three seed queries into the real phrases Google users type right now.
- **Google Trends**: Returns interest-over-time indices for up to three keywords with optional geo and category filters.
- **Keyword clustering**: Merges Search Console queries and Google Autocomplete expansions into intent-driven groups with page recommendations.
- **Next.js 15 App Router** with strict TypeScript, ESLint, and Prettier configuration.
- **Structured MCP responses** with consistent error handling and lightweight rate limiting.

## Requirements

- Node.js 18.18 or newer.
- `pnpm` or `npm` for dependency management.
- Google Search Console service account credentials (only for `get_keyword_clusters`).

## Getting started locally

```bash
pnpm install
pnpm dev
```

The development server defaults to `http://localhost:3000`.

### Search Console credentials

The keyword clustering tool queries the Google Search Console Search Analytics API using a service account. Set the following environment variables before running the server:

- `GOOGLE_CLIENT_EMAIL` – service account email with access to the Search Console property.
- `GOOGLE_PRIVATE_KEY` – private key for the service account (escape newlines as `\n` in `.env`).

Alternative variable names (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) are also recognised for compatibility.

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

### `get_keyword_clusters`

Produces intent-based keyword clusters by combining Google Search Console performance data with optional Google Autocomplete expansions. Provide a verified `siteUrl` and an optional seed `query`. The tool scores clusters, maps them to the best-performing page, and suggests next steps.

```json
{
  "tool": "get_keyword_clusters",
  "input": {
    "query": "solar panels",
    "siteUrl": "https://example.com/",
    "timeRange": "last_90_days",
    "maxKeywords": 1500
  }
}
```

Result (truncated):

```json
{
  "ok": true,
  "data": {
    "query": "solar panels",
    "siteUrl": "https://example.com/",
    "clusters": [
      {
        "label": "solar panel installation",
        "priority": 78,
        "representativeKeyword": "solar panel installation cost",
        "mappedPage": { "type": "existing", "url": "https://example.com/solar/installation" },
        "rollup": {
          "keywords": 9,
          "sumImpressions": 18400,
          "sumClicks": 1240,
          "avgCtr": 0.045,
          "avgPosition": 6.2
        },
        "recommendations": [
          "Update page for \"solar panel installation\" with FAQs and subtopics.",
          "Add internal links from related pages."
        ]
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
- **Tools**: Automatically discovered (`ping`, `get_autocomplete_suggestions`, `get_trend_index`, `get_keyword_clusters`).
- **Auth flow**: None required—both tools rely on public Google endpoints.

Example invocation in ChatGPT:

```json
{
  "tool": "get_trend_index",
  "input": { "keyword": "toroidal transformer" }
}
```

Expect a JSON payload with interest-over-time points that you can combine with autocomplete suggestions or the
`get_keyword_clusters` tool to validate seasonal demand and prioritise content.

## Troubleshooting

| Symptom               | Resolution                                                                      |
| --------------------- | ------------------------------------------------------------------------------- |
| `RATE_LIMIT_EXCEEDED` | Wait until the window resets (~60 seconds) or reduce tool frequency.            |
| `UPSTREAM_ERROR`      | Google responded with an error status. Retry later or adjust the query/filters. |
| `UNKNOWN`             | Check server logs for the underlying exception.                                 |

## Acceptance checklist

- [x] Autocomplete MCP tool returning Google Suggest phrases.
- [x] Trends MCP tool returning interest-over-time data.
- [x] Keyword clustering MCP tool grouping Search Console queries into recommendations.
- [x] README covering setup, usage, and troubleshooting.
