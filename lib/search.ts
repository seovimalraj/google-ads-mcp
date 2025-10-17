import { URLSearchParams } from 'node:url';

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? `${service} request failed with status ${status}`);
    this.name = 'UpstreamError';
  }
}

function stripJsonPrefix(payload: string): string {
  return payload.replace(/^\)\]\}'?,?/, '').trim();
}

export async function fetchAutocompleteSuggestions(
  query: string,
): Promise<{ query: string; suggestions: string[] }> {
  const searchParams = new URLSearchParams({ client: 'firefox', q: query });
  const response = await fetch(
    `https://suggestqueries.google.com/complete/search?${searchParams.toString()}`,
    {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!response.ok) {
    throw new UpstreamError(
      'google-autocomplete',
      response.status,
      'Failed to fetch autocomplete suggestions.',
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Autocomplete response was not valid JSON.');
  }

  if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
    throw new Error('Unexpected autocomplete payload format.');
  }

  const suggestions = data[1].filter((value): value is string => typeof value === 'string');
  return { query, suggestions };
}

interface TrendsExploreWidget {
  id: string;
  token: string;
  request: Record<string, unknown>;
}

interface TimelineEntry {
  time: string;
  formattedTime?: string;
  formattedValue?: string[];
  value?: number[];
}

export interface TrendIndexOptions {
  keyword: string;
  geo?: string;
  timeRange?: string;
  category?: number;
  property?: string;
}

export interface TrendIndexPoint {
  time: string;
  formattedTime: string;
  values: number[];
}

export interface TrendIndexResult {
  keyword: string;
  geo: string;
  timeRange: string;
  seriesLabels: string[];
  averages: number[];
  points: TrendIndexPoint[];
}

export async function fetchTrendIndex(options: TrendIndexOptions): Promise<TrendIndexResult> {
  const comparisonItem = [
    {
      keyword: options.keyword,
      geo: options.geo ?? '',
      time: options.timeRange ?? 'today 12-m',
    },
  ];

  const exploreParams = new URLSearchParams({
    hl: 'en-US',
    tz: '0',
    req: JSON.stringify({
      comparisonItem,
      category: options.category ?? 0,
      property: options.property ?? '',
    }),
  });

  const exploreResponse = await fetch(
    `https://trends.google.com/trends/api/explore?${exploreParams.toString()}`,
    {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!exploreResponse.ok) {
    throw new UpstreamError(
      'google-trends-explore',
      exploreResponse.status,
      'Failed to initialise trends request.',
    );
  }

  const explorePayload = stripJsonPrefix(await exploreResponse.text());
  let exploreData: any;
  try {
    exploreData = JSON.parse(explorePayload);
  } catch {
    throw new Error('Unable to parse explore response from Google Trends.');
  }

  const widget: TrendsExploreWidget | undefined = (exploreData?.widgets ?? []).find(
    (candidate: TrendsExploreWidget) => candidate?.id === 'TIMESERIES' && candidate?.token,
  );

  if (!widget) {
    throw new Error('Could not locate a timeseries widget in the explore response.');
  }

  const multilineParams = new URLSearchParams({
    hl: 'en-US',
    tz: '0',
    req: JSON.stringify(widget.request ?? {}),
    token: widget.token,
  });

  const timelineResponse = await fetch(
    `https://trends.google.com/trends/api/widgetdata/multiline?${multilineParams.toString()}`,
    {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!timelineResponse.ok) {
    throw new UpstreamError(
      'google-trends-data',
      timelineResponse.status,
      'Failed to fetch trends timeline data.',
    );
  }

  const timelinePayload = stripJsonPrefix(await timelineResponse.text());
  let timelineData: any;
  try {
    timelineData = JSON.parse(timelinePayload);
  } catch {
    throw new Error('Unable to parse timeline response from Google Trends.');
  }

  const defaultTimeline = timelineData?.default ?? timelineData;
  const entries: TimelineEntry[] = Array.isArray(defaultTimeline?.timelineData)
    ? defaultTimeline.timelineData
    : [];

  const points: TrendIndexPoint[] = [];
  for (const entry of entries) {
    const time = typeof entry.time === 'string' ? entry.time : '';
    if (!time) {
      continue;
    }
    const formattedTime =
      typeof entry.formattedTime === 'string'
        ? entry.formattedTime
        : new Date(Number(time) * 1000).toISOString();
    const values = Array.isArray(entry.value)
      ? entry.value.filter((value): value is number => typeof value === 'number')
      : [];
    if (values.length === 0) {
      continue;
    }
    points.push({ time, formattedTime, values });
  }

  const seriesLabels: string[] = Array.isArray(defaultTimeline?.legend)
    ? defaultTimeline.legend.filter((label: unknown): label is string => typeof label === 'string')
    : Array.isArray(defaultTimeline?.seriesLabels)
      ? defaultTimeline.seriesLabels.filter(
          (label: unknown): label is string => typeof label === 'string',
        )
      : [];

  const averages: number[] = Array.isArray(defaultTimeline?.averages)
    ? defaultTimeline.averages.filter(
        (value: unknown): value is number => typeof value === 'number',
      )
    : [];

  let requestGeo: string | undefined;
  let requestTime: string | undefined;
  const comparisonItems = (widget.request as { comparisonItem?: unknown })?.comparisonItem;
  if (Array.isArray(comparisonItems) && comparisonItems.length > 0) {
    const first = comparisonItems[0];
    if (first && typeof first === 'object') {
      const item = first as Record<string, unknown>;
      if (typeof item.geo === 'string') {
        requestGeo = item.geo;
      }
      if (typeof item.time === 'string') {
        requestTime = item.time;
      }
    }
  }

  const resolvedGeo = requestGeo ?? options.geo ?? '';
  const resolvedTime = requestTime ?? options.timeRange ?? 'today 12-m';

  return {
    keyword: options.keyword,
    geo: resolvedGeo,
    timeRange: resolvedTime,
    seriesLabels,
    averages,
    points,
  };
}

export const __testUtils = {
  stripJsonPrefix,
};
