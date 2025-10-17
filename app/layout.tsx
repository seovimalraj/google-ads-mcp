import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Google Ads MCP Server',
  description:
    'Model Context Protocol server for Google Ads keyword discovery, historical metrics, and forecasts.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          backgroundColor: '#0b101a',
          color: '#f5f7ff',
          fontFamily:
            '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          lineHeight: 1.6,
        }}
      >
        {children}
      </body>
    </html>
  );
}
