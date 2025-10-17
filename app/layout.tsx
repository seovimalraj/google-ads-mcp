import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Google Search MCP Server',
  description:
    'Model Context Protocol server offering Google Autocomplete suggestions and Google Trends interest indices.',
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
