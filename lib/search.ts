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
  keywords: string[];
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
  keywords: string[];
  geo: string;
  timeRange: string;
  seriesLabels: string[];
  averages: number[];
  points: TrendIndexPoint[];
}

export interface RelatedQueryEntry {
  query: string;
  value: number;
  formattedValue?: string;
  link?: string;
}

export interface RelatedTopicEntry {
  topic: {
    mid: string;
    title: string;
    type?: string;
  };
  value: number;
  formattedValue?: string;
  link?: string;
}

export interface RelatedQueriesResult {
  keyword: string;
  keywords: string[];
  geo: string;
  timeRange: string;
  top: RelatedQueryEntry[];
  rising: RelatedQueryEntry[];
}

export interface RelatedTopicsResult {
  keyword: string;
  keywords: string[];
  geo: string;
  timeRange: string;
  top: RelatedTopicEntry[];
  rising: RelatedTopicEntry[];
}

async function fetchTrendsWidget(
  options: TrendIndexOptions,
  widgetId: string,
): Promise<TrendsExploreWidget> {
  const comparisonItem = options.keywords.map((keyword) => ({
    keyword,
    geo: options.geo ?? '',
    time: options.timeRange ?? 'today 12-m',
  }));

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
    (candidate: TrendsExploreWidget) => candidate?.id === widgetId && candidate?.token,
  );

  if (!widget) {
    throw new Error(`Could not locate a ${widgetId} widget in the explore response.`);
  }

  return widget;
}

function resolveTrendsRequestMeta(
  widget: TrendsExploreWidget,
  options: TrendIndexOptions,
): { geo: string; timeRange: string } {
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

  return {
    geo: requestGeo ?? options.geo ?? '',
    timeRange: requestTime ?? options.timeRange ?? 'today 12-m',
  };
}

function extractRankedKeywords(list: unknown): RelatedQueryEntry[] {
  if (!list || typeof list !== 'object') {
    return [];
  }
  const rankedKeyword = (list as { rankedKeyword?: unknown }).rankedKeyword;
  if (!Array.isArray(rankedKeyword)) {
    return [];
  }
  return rankedKeyword.reduce<RelatedQueryEntry[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }
    const record = entry as Record<string, unknown>;
    const query = typeof record.query === 'string' ? record.query : '';
    const value = typeof record.value === 'number' ? record.value : null;
    if (!query || value === null) {
      return acc;
    }
    acc.push({
      query,
      value,
      formattedValue:
        typeof record.formattedValue === 'string' ? record.formattedValue : undefined,
      link: typeof record.link === 'string' ? record.link : undefined,
    });
    return acc;
  }, []);
}

function extractRankedTopics(list: unknown): RelatedTopicEntry[] {
  if (!list || typeof list !== 'object') {
    return [];
  }
  const rankedKeyword = (list as { rankedKeyword?: unknown }).rankedKeyword;
  if (!Array.isArray(rankedKeyword)) {
    return [];
  }
  return rankedKeyword.reduce<RelatedTopicEntry[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }
    const record = entry as Record<string, unknown>;
    const value = typeof record.value === 'number' ? record.value : null;
    const topic = record.topic;
    if (!topic || typeof topic !== 'object' || value === null) {
      return acc;
    }
    const topicRecord = topic as Record<string, unknown>;
    const mid = typeof topicRecord.mid === 'string' ? topicRecord.mid : '';
    const title = typeof topicRecord.title === 'string' ? topicRecord.title : '';
    if (!mid || !title) {
      return acc;
    }
    acc.push({
      topic: {
        mid,
        title,
        type: typeof topicRecord.type === 'string' ? topicRecord.type : undefined,
      },
      value,
      formattedValue:
        typeof record.formattedValue === 'string' ? record.formattedValue : undefined,
      link: typeof record.link === 'string' ? record.link : undefined,
    });
    return acc;
  }, []);
}

export async function fetchTrendIndex(options: TrendIndexOptions): Promise<TrendIndexResult> {
  if (!Array.isArray(options.keywords) || options.keywords.length === 0) {
    throw new Error('At least one keyword is required.');
  }

  const widget = await fetchTrendsWidget(options, 'TIMESERIES');

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

  let seriesLabels: string[] = [];
  if (Array.isArray(defaultTimeline?.legend)) {
    seriesLabels = defaultTimeline.legend.filter(
      (label: unknown): label is string => typeof label === 'string',
    );
  } else if (Array.isArray(defaultTimeline?.seriesLabels)) {
    seriesLabels = defaultTimeline.seriesLabels.filter(
      (label: unknown): label is string => typeof label === 'string',
    );
  }
  const resolvedSeriesLabels = seriesLabels.length > 0 ? seriesLabels : [...options.keywords];
  const averages: number[] = Array.isArray(defaultTimeline?.averages)
    ? defaultTimeline.averages.filter(
        (value: unknown): value is number => typeof value === 'number',
      )
    : [];

  const { geo: resolvedGeo, timeRange: resolvedTime } = resolveTrendsRequestMeta(widget, options);

  return {
    keyword: options.keywords[0] ?? '',
    keywords: options.keywords,
    geo: resolvedGeo,
    timeRange: resolvedTime,
    seriesLabels: resolvedSeriesLabels,
    averages,
    points,
  };
}

export async function fetchRelatedQueries(
  options: TrendIndexOptions,
): Promise<RelatedQueriesResult> {
  if (!Array.isArray(options.keywords) || options.keywords.length === 0) {
    throw new Error('At least one keyword is required.');
  }

  const widget = await fetchTrendsWidget(options, 'RELATED_QUERIES');

  const relatedParams = new URLSearchParams({
    hl: 'en-US',
    tz: '0',
    req: JSON.stringify(widget.request ?? {}),
    token: widget.token,
  });

  const relatedResponse = await fetch(
    `https://trends.google.com/trends/api/widgetdata/relatedsearches?${relatedParams.toString()}`,
    {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!relatedResponse.ok) {
    throw new UpstreamError(
      'google-trends-related',
      relatedResponse.status,
      'Failed to fetch related queries from Google Trends.',
    );
  }

  const relatedPayload = stripJsonPrefix(await relatedResponse.text());
  let relatedData: any;
  try {
    relatedData = JSON.parse(relatedPayload);
  } catch {
    throw new Error('Unable to parse related queries response from Google Trends.');
  }

  const rankedLists: unknown[] = Array.isArray(relatedData?.default?.rankedList)
    ? relatedData.default.rankedList
    : [];
  const [topList, risingList] = rankedLists;
  const top = extractRankedKeywords(topList);
  const rising = extractRankedKeywords(risingList);

  const { geo: resolvedGeo, timeRange: resolvedTime } = resolveTrendsRequestMeta(widget, options);

  return {
    keyword: options.keywords[0] ?? '',
    keywords: options.keywords,
    geo: resolvedGeo,
    timeRange: resolvedTime,
    top,
    rising,
  };
}

export async function fetchRelatedTopics(
  options: TrendIndexOptions,
): Promise<RelatedTopicsResult> {
  if (!Array.isArray(options.keywords) || options.keywords.length === 0) {
    throw new Error('At least one keyword is required.');
  }

  const widget = await fetchTrendsWidget(options, 'RELATED_TOPICS');

  const relatedParams = new URLSearchParams({
    hl: 'en-US',
    tz: '0',
    req: JSON.stringify(widget.request ?? {}),
    token: widget.token,
  });

  const relatedResponse = await fetch(
    `https://trends.google.com/trends/api/widgetdata/relatedsearches?${relatedParams.toString()}`,
    {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );

  if (!relatedResponse.ok) {
    throw new UpstreamError(
      'google-trends-related-topics',
      relatedResponse.status,
      'Failed to fetch related topics from Google Trends.',
    );
  }

  const relatedPayload = stripJsonPrefix(await relatedResponse.text());
  let relatedData: any;
  try {
    relatedData = JSON.parse(relatedPayload);
  } catch {
    throw new Error('Unable to parse related topics response from Google Trends.');
  }

  const rankedLists: unknown[] = Array.isArray(relatedData?.default?.rankedList)
    ? relatedData.default.rankedList
    : [];
  const [topList, risingList] = rankedLists;
  const top = extractRankedTopics(topList);
  const rising = extractRankedTopics(risingList);

  const { geo: resolvedGeo, timeRange: resolvedTime } = resolveTrendsRequestMeta(widget, options);

  return {
    keyword: options.keywords[0] ?? '',
    keywords: options.keywords,
    geo: resolvedGeo,
    timeRange: resolvedTime,
    top,
    rising,
  };
}

export const __testUtils = {
  stripJsonPrefix,
};
