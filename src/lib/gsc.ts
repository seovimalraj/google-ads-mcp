import { google, webmasters_v3 } from 'googleapis';

type SearchAnalyticsRow = webmasters_v3.Schema$ApiDataRow;

type Dimension = 'query' | 'page';

type DimensionFilterOperator = 'contains' | 'equals' | 'notEquals';

export interface FetchGscRowsOptions {
  siteUrl: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
  rowLimit?: number;
  dimensions?: Dimension[];
  filters?: Array<{
    dimension: Dimension;
    operator: DimensionFilterOperator;
    expression: string;
  }>;
}

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const SEARCH_CONSOLE_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

let authClient: webmasters_v3.Options['auth'];

async function getAuthClient(): Promise<webmasters_v3.Options['auth']> {
  if (authClient) {
    return authClient;
  }

  const clientEmail =
    process.env.GOOGLE_CLIENT_EMAIL ??
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL;
  const privateKeyRaw =
    process.env.GOOGLE_PRIVATE_KEY ??
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ??
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY ??
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      'Search Console credentials are not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.',
    );
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  authClient = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SEARCH_CONSOLE_SCOPES,
  });
  return authClient;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(options: FetchGscRowsOptions): { startDate: string; endDate: string } {
  if (options.startDate && options.endDate) {
    return { startDate: options.startDate, endDate: options.endDate };
  }

  const range = options.timeRange ?? 'last_90_days';
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);

  const lastDaysMatch = /^last_(\d+)_days$/i.exec(range);
  if (lastDaysMatch) {
    const days = Math.max(1, Number.parseInt(lastDaysMatch[1], 10));
    start.setUTCDate(end.getUTCDate() - (days - 1));
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }

  const lastMonthsMatch = /^last_(\d+)_months$/i.exec(range);
  if (lastMonthsMatch) {
    const months = Math.max(1, Number.parseInt(lastMonthsMatch[1], 10));
    start.setUTCMonth(end.getUTCMonth() - months);
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }

  const customMatch = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/i.exec(range);
  if (customMatch) {
    return { startDate: customMatch[1], endDate: customMatch[2] };
  }

  switch (range) {
    case 'last_28_days':
      start.setUTCDate(end.getUTCDate() - 27);
      break;
    case 'last_180_days':
      start.setUTCDate(end.getUTCDate() - 179);
      break;
    case 'last_12_months':
      start.setUTCMonth(end.getUTCMonth() - 12);
      break;
    default:
      start.setUTCDate(end.getUTCDate() - 89);
      break;
  }

  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function mapRows(rows: SearchAnalyticsRow[] = []): GscRow[] {
  return rows
    .map((row) => {
      const keys = Array.isArray(row.keys) ? row.keys : [];
      const [query = '', page = ''] = keys;
      return {
        query,
        page,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      } satisfies GscRow;
    })
    .filter((row) => row.query.length > 0);
}

export async function fetchGscRows(options: FetchGscRowsOptions): Promise<GscRow[]> {
  if (!options.siteUrl) {
    throw new Error('siteUrl is required to query Search Console.');
  }

  const auth = await getAuthClient();
  const webmasters = google.webmasters({ version: 'v3', auth });
  const { startDate, endDate } = resolveDateRange(options);

  const requestBody: webmasters_v3.Schema$SearchAnalyticsQueryRequest = {
    startDate,
    endDate,
    dimensions: options.dimensions ?? ['query', 'page'],
    rowLimit: Math.min(options.rowLimit ?? 5000, 25000),
  };

  if (options.filters?.length) {
    requestBody.dimensionFilterGroups = [
      {
        filters: options.filters.map((filter) => ({
          dimension: filter.dimension,
          operator: filter.operator,
          expression: filter.expression,
        })),
      },
    ];
  }

  const response = await webmasters.searchanalytics.query({
    siteUrl: options.siteUrl,
    requestBody,
  });

  return mapRows(response.data.rows);
}
