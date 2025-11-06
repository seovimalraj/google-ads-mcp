import type { KeywordClustersInput } from '@/lib/schemas';
import { fetchAutocomplete } from '../lib/googleAutocomplete';
import { fetchGscRows, type GscRow } from '../lib/gsc';

interface KeywordMetrics {
  keyword: string;
  tokens: string[];
  pages: Set<string>;
  clicks: number;
  impressions: number;
  ctrs: number[];
  positions: number[];
}

interface PageAggregate {
  impr: number;
  clicks: number;
  pos: number[];
  ctr: number[];
}

export interface KeywordClusterRecommendation {
  label: string;
  priority: number;
  representativeKeyword: string;
  mappedPage: { type: 'existing'; url: string } | { type: 'new'; suggestedSlug: string };
  rollup: {
    keywords: number;
    sumImpressions: number;
    sumClicks: number;
    avgCtr: number;
    avgPosition: number;
  };
  keywords: Array<{
    keyword: string;
    clicks: number;
    impressions: number;
    avgCtr: number;
    avgPosition: number;
    pages: string[];
  }>;
  recommendations: string[];
}

export interface KeywordClustersResult {
  query: string;
  siteUrl: string;
  geo: string;
  timeRange: string;
  includeAutocomplete: boolean;
  generatedAt: string;
  clusters: KeywordClusterRecommendation[];
}

const stopwords = new Set([
  'the',
  'and',
  'for',
  'a',
  'of',
  'to',
  'in',
  'on',
  'is',
  'with',
  'by',
  'from',
  'at',
  'how',
  'what',
  'why',
  'when',
  'where',
  'which',
  'an',
  'or',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  if (intersection === 0) {
    return 0;
  }
  return intersection / (a.size + b.size - intersection);
}

function levenshteinNorm(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) {
    return 0;
  }
  const matrix: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= n; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[m][n] / Math.max(m, n);
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function norm(value: number): number {
  const safe = Math.max(0, value);
  return Math.min(1, safe / (safe + 1000));
}

function mostCommonBigram(keywords: string[]): string {
  const counter = new Map<string, number>();
  for (const keyword of keywords) {
    const tokens = tokenize(keyword);
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      counter.set(bigram, (counter.get(bigram) ?? 0) + 1);
    }
  }
  const [best] = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? keywords[0];
}

function recommendationMessages(
  mappedType: 'existing' | 'new',
  avgPosition: number,
  avgCtr: number,
  label: string,
): string[] {
  const recs: string[] = [];
  if (mappedType === 'existing' && avgPosition > 5 && avgPosition < 15) {
    recs.push(`Update page for "${label}" with FAQs and subtopics.`);
  }
  if (mappedType === 'new' && avgPosition > 15) {
    recs.push(`Create a new page targeting "${label}".`);
  }
  if (avgCtr < 0.02 && avgPosition <= 5) {
    recs.push(`Improve meta title for "${label}" to boost CTR.`);
  }
  recs.push('Add internal links from related pages.');
  return recs;
}

function toKeywordMetrics(row: GscRow): KeywordMetrics {
  const keyword = normalize(row.query);
  return {
    keyword,
    tokens: tokenize(keyword),
    pages: new Set(row.page ? [row.page] : []),
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctrs: row.ctr ? [row.ctr] : [],
    positions: Number.isFinite(row.position) ? [row.position] : [],
  };
}

export async function getKeywordClusters(
  input: KeywordClustersInput,
): Promise<KeywordClustersResult> {
  const {
    query = '',
    siteUrl,
    timeRange = 'last_90_days',
    includeAutocomplete = true,
    geo = 'US',
    maxKeywords = 2000,
  } = input;

  const [gscRows, autocompleteSeeds] = await Promise.all([
    fetchGscRows({ siteUrl, timeRange, rowLimit: Math.min(maxKeywords * 4, 25000) }),
    includeAutocomplete && query ? fetchAutocomplete(query, 2) : Promise.resolve([]),
  ]);

  const keywordMap = new Map<string, KeywordMetrics>();

  for (const row of gscRows) {
    const normalized = normalize(row.query);
    if (!normalized) {
      continue;
    }
    const existing = keywordMap.get(normalized);
    if (existing) {
      existing.clicks += row.clicks ?? 0;
      existing.impressions += row.impressions ?? 0;
      if (row.ctr !== undefined) {
        existing.ctrs.push(row.ctr);
      }
      if (row.position !== undefined) {
        existing.positions.push(row.position);
      }
      if (row.page) {
        existing.pages.add(row.page);
      }
    } else {
      keywordMap.set(normalized, toKeywordMetrics(row));
    }
  }

  for (const seed of autocompleteSeeds as string[]) {
    const normalized = normalize(seed);
    if (!normalized || keywordMap.has(normalized)) {
      continue;
    }
    keywordMap.set(normalized, {
      keyword: normalized,
      tokens: tokenize(normalized),
      pages: new Set<string>(),
      clicks: 0,
      impressions: 0,
      ctrs: [],
      positions: [],
    });
  }

  const keywords = Array.from(keywordMap.keys()).slice(0, maxKeywords);
  const edges: Record<string, Set<string>> = {};

  for (let i = 0; i < keywords.length; i += 1) {
    for (let j = i + 1; j < keywords.length; j += 1) {
      const a = keywords[i];
      const b = keywords[j];
      const metricsA = keywordMap.get(a);
      const metricsB = keywordMap.get(b);
      if (!metricsA || !metricsB) {
        continue;
      }
      let similarity = 0;
      const jac = jaccard(new Set(metricsA.tokens), new Set(metricsB.tokens));
      if (jac >= 0.6) {
        similarity = Math.max(similarity, jac);
      }
      const sharePage = metricsA.pages.size > 0 && metricsB.pages.size > 0;
      if (sharePage) {
        const shared = [...metricsA.pages].some((page) => metricsB.pages.has(page));
        if (shared) {
          similarity = Math.max(similarity, 0.3);
        }
      }
      const lev = levenshteinNorm(a, b);
      if (lev <= 0.15 && jac >= 0.4) {
        similarity = Math.max(similarity, 0.7);
      }
      if (similarity >= 0.6) {
        edges[a] ??= new Set<string>();
        edges[b] ??= new Set<string>();
        edges[a].add(b);
        edges[b].add(a);
      }
    }
  }

  const parent: Record<string, string> = {};
  const find = (value: string): string => {
    if (parent[value] === value) {
      return value;
    }
    parent[value] = find(parent[value]);
    return parent[value];
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };

  for (const keyword of keywords) {
    parent[keyword] = keyword;
  }
  for (const [node, neighbours] of Object.entries(edges)) {
    for (const neighbour of neighbours) {
      union(node, neighbour);
    }
  }

  const clustersMap = new Map<string, string[]>();
  for (const keyword of keywords) {
    const root = find(keyword);
    const list = clustersMap.get(root);
    if (list) {
      list.push(keyword);
    } else {
      clustersMap.set(root, [keyword]);
    }
  }

  const clusters = [...clustersMap.values()].filter((group) => group.length > 0);

  const results = clusters
    .map<KeywordClusterRecommendation>((clusterKeywords) => {
      let sumImpressions = 0;
      let sumClicks = 0;
      let ctrSum = 0;
      let ctrCount = 0;
      let posSum = 0;
      let posCount = 0;
      const pageAggregates = new Map<string, PageAggregate>();

      for (const keyword of clusterKeywords) {
        const metrics = keywordMap.get(keyword);
        if (!metrics) {
          continue;
        }
        sumImpressions += metrics.impressions;
        sumClicks += metrics.clicks;
        if (metrics.ctrs.length) {
          ctrSum += avg(metrics.ctrs);
          ctrCount += 1;
        }
        if (metrics.positions.length) {
          posSum += avg(metrics.positions);
          posCount += 1;
        }
        for (const page of metrics.pages) {
          const aggregate = pageAggregates.get(page) ?? {
            impr: 0,
            clicks: 0,
            pos: [] as number[],
            ctr: [] as number[],
          };
          aggregate.impr += metrics.impressions;
          aggregate.clicks += metrics.clicks;
          aggregate.pos.push(...metrics.positions);
          aggregate.ctr.push(...metrics.ctrs);
          pageAggregates.set(page, aggregate);
        }
      }

      const avgCtr = ctrCount ? ctrSum / ctrCount : 0;
      const avgPosition = posCount ? posSum / posCount : 0;

      let mappedPage: KeywordClusterRecommendation['mappedPage'] = {
        type: 'new',
        suggestedSlug: `/${clusterKeywords[0]?.split(' ').slice(0, 3).join('-')}`,
      };

      if (pageAggregates.size > 0) {
        const [best] = [...pageAggregates.entries()].sort((a, b) => {
          const scoreA = scorePageAggregate(a[1]);
          const scoreB = scorePageAggregate(b[1]);
          return scoreB - scoreA;
        });
        if (best) {
          mappedPage = { type: 'existing', url: best[0] };
        }
      }

      const label = mostCommonBigram(clusterKeywords);
      const representative = [...clusterKeywords].sort((a, b) => {
        const metricsA = keywordMap.get(a);
        const metricsB = keywordMap.get(b);
        return (metricsB?.impressions ?? 0) - (metricsA?.impressions ?? 0);
      })[0];

      const priority = Math.round(
        100 *
          (0.35 * norm(sumImpressions) +
            0.25 * norm(avgCtr) +
            0.2 * (1 - norm(avgPosition)) +
            0.15 * (mappedPage.type === 'new' ? 1 : 0)),
      );

      const keywordsDetails = clusterKeywords.map((keyword) => {
        const metrics = keywordMap.get(keyword)!;
        return {
          keyword,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          avgCtr: avg(metrics.ctrs),
          avgPosition: avg(metrics.positions),
          pages: [...metrics.pages],
        };
      });
      return {
        label,
        priority,
        representativeKeyword: representative,
        mappedPage,
        rollup: {
          keywords: clusterKeywords.length,
          sumImpressions,
          sumClicks,
          avgCtr,
          avgPosition,
        },
        keywords: keywordsDetails,
        recommendations: recommendationMessages(mappedPage.type, avgPosition, avgCtr, label),
      };
    })
    .sort((a, b) => b.priority - a.priority);

  return {
    query,
    siteUrl,
    geo,
    timeRange,
    includeAutocomplete,
    generatedAt: new Date().toISOString(),
    clusters: results,
  };
}

function scorePageAggregate(aggregate: PageAggregate): number {
  const avgPos = avg(aggregate.pos);
  const avgCtr = avg(aggregate.ctr);
  return 0.6 * aggregate.impr + 5 * aggregate.clicks - 50 * avgPos + 1000 * avgCtr;
}
