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
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Google Ads MCP Server';

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
  const oauthExample = `${baseUrl}/api/auth/start?userId=demo&customerId=1234567890`;

  return (
    <main style={containerStyle}>
      <div style={accentStyle}>
        <span role="img" aria-hidden="true">
          🚀
        </span>
        Ready for ChatGPT MCP
      </div>

      <h1 style={headingStyle}>{appName}</h1>
      <p style={subheadingStyle}>
        This deployment exposes a secure Model Context Protocol server backed by the Google Ads
        Keyword Planner. Use the built-in OAuth flow to store encrypted refresh tokens and call the
        keyword, metrics, or forecast tools from ChatGPT or any MCP-compatible client.
      </p>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Quick start</h2>
        <ol style={listStyle}>
          <li>
            Provide the required environment variables (see{' '}
            <a
              style={linkStyle}
              href="https://github.com/openai/google-ads-mcp/blob/main/.env.example"
            >
              .env.example
            </a>
            ) and redeploy if you update any secrets.
          </li>
          <li>
            Visit{' '}
            <a style={linkStyle} href={oauthExample}>
              {oauthExample}
            </a>{' '}
            to complete Google OAuth. The refresh token is encrypted with your{' '}
            <InlineCode>ENCRYPTION_KEY</InlineCode> and stored in Redis.
          </li>
          <li>
            Add the MCP server URL <InlineCode>{baseUrl}/api/mcp</InlineCode> to your ChatGPT
            configuration. Use the sample payloads below to verify each tool.
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
  "tools": ["ping", "get_keyword_ideas", "get_historical_metrics", "get_forecast"]
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
  "tool": "ping",
  "input": { "userId": "demo" }
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Keyword ideas</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
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
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Historical metrics</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
  "tool": "get_historical_metrics",
  "input": {
    "userId": "demo",
    "customerId": "1234567890",
    "keywords": ["toroidal transformer"],
    "locationIds": ["2356"],
    "languageId": "1000"
  }
}`}
                </pre>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>
                <strong>Forecast</strong>
              </td>
              <td style={tdStyle}>
                <pre style={codeStyle}>
                  {`{
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
          <a style={linkStyle} href="https://github.com/openai/google-ads-mcp">
            project README
          </a>{' '}
          for setup details, troubleshooting steps, and deployment tips.
        </p>
      </section>
    </main>
  );
}
