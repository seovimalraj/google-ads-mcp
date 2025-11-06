import type { CSSProperties, ReactNode } from 'react';

const headingStyle: CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
};

const subheadingStyle: CSSProperties = {
  fontSize: '1.1rem',
  color: 'rgba(245, 247, 255, 0.75)',
  maxWidth: '46rem',
  lineHeight: 1.6,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 600,
  marginBottom: '0.75rem',
};

const cardStyle: CSSProperties = {
  backgroundColor: 'rgba(15, 20, 32, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '16px',
  padding: '1.75rem',
  marginBottom: '1.5rem',
  boxShadow: '0 18px 60px rgba(6, 8, 14, 0.45)',
};

const codeStyle: CSSProperties = {
  fontFamily:
    '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.95rem',
  background: 'rgba(12, 17, 28, 0.9)',
  borderRadius: '10px',
  padding: '1rem 1.25rem',
  display: 'block',
  overflowX: 'auto',
  margin: '0.75rem 0',
  border: '1px solid rgba(255, 255, 255, 0.04)',
};

const listStyle: CSSProperties = {
  display: 'grid',
  gap: '1.25rem',
  paddingLeft: '1.25rem',
  margin: '0',
};

const linkStyle: CSSProperties = {
  color: '#7dd3fc',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(125, 211, 252, 0.4)',
  textDecorationThickness: '2px',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.75rem 0.5rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
};

const tdStyle: CSSProperties = {
  padding: '0.75rem 0.5rem',
  fontSize: '0.95rem',
  verticalAlign: 'top',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  lineHeight: 1.6,
};

const accentStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.95rem',
  color: 'rgba(125, 211, 252, 0.85)',
  background: 'rgba(125, 211, 252, 0.12)',
  borderRadius: '999px',
  padding: '0.35rem 0.9rem',
  marginBottom: '1rem',
};

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '3.5rem 1.5rem 4.5rem',
  maxWidth: '960px',
  margin: '0 auto',
  fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const rawBaseUrl = process.env.NEXTAUTH_URL?.trim();
const baseUrlSource =
  rawBaseUrl && rawBaseUrl.length > 0 ? rawBaseUrl : 'https://your-app.vercel.app';
const baseUrl = baseUrlSource.replace(/\/$/, '');
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Google Search MCP Server';

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        fontFamily: codeStyle.fontFamily,
        background: 'rgba(12, 17, 28, 0.85)',
        borderRadius: '6px',
        padding: '0.15rem 0.45rem',
        fontSize: '0.92rem',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      {children}
    </code>
  );
}

export default function HomePage() {
  return (
    <main style={containerStyle}>
      <div style={accentStyle}>
        <span role="img" aria-hidden="true">
          🔍
        </span>
        SEO research toolkit for MCP
      </div>

      <h1 style={headingStyle}>{appName}</h1>
      <p style={subheadingStyle}>
        This deployment exposes a Model Context Protocol server with two lightweight tools sourced
        directly from Google. Pull live autocomplete suggestions and Google Trends indices without
        OAuth or external databases—perfect for keyword discovery inside ChatGPT Developer Mode.
      </p>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Quick start</h2>
        <ol style={listStyle}>
          <li>
            Deploy or run locally with <InlineCode>pnpm dev</InlineCode> (Node.js 18.18+).
          </li>
          <li>
            Provide Search Console service account credentials for clustering; Autocomplete and
            Trends continue to rely on public endpoints.
          </li>
          <li>
            Add the MCP server URL <InlineCode>{baseUrl}/api/mcp</InlineCode> to ChatGPT Developer
            Mode and invoke the sample payloads below.
          </li>
        </ol>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Health check</h2>
        <p>
          Call <InlineCode>GET {baseUrl}/api/mcp</InlineCode> to list the available tools. A
          successful response looks like:
        </p>
        <pre style={codeStyle}>
          {`{
  "status": "ok",
  "tools": ["ping", "get_autocomplete_suggestions", "get_trend_index", "get_keyword_clusters"]
}`}
        </pre>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Tool invocations</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Tool</th>
              <th style={thStyle}>Sample payload</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>
                <strong>Ping</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
  "tool": "ping"
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Autocomplete suggestions</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
  "tool": "get_autocomplete_suggestions",
  "input": {
    "query": "toroidal transformer"
  }
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Trend index</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
  "tool": "get_trend_index",
  "input": {
    "keyword": "toroidal transformer",
    "timeRange": "today 12-m",
    "geo": "US"
  }
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Keyword clusters</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
  "tool": "get_keyword_clusters",
  "input": {
    "query": "solar panels",
    "siteUrl": "https://example.com/",
    "timeRange": "last_90_days"
  }
}`}
                </pre>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ ...cardStyle, marginBottom: 0 }}>
        <h2 style={sectionTitleStyle}>Need help?</h2>
        <p>
          Check the{' '}
          <a style={linkStyle} href="https://github.com/openai/google-search-mcp">
            project README
          </a>{' '}
          for setup details, troubleshooting steps, and deployment tips.
        </p>
      </section>
    </main>
  );
}
