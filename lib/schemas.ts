import { z } from 'zod';

const keywordString = z
  .string()
  .min(1, 'keywords must not be empty.')
  .max(512, 'keywords must be 512 characters or fewer.');

const keywordArray = z
  .array(keywordString)
  .min(1, 'Provide at least one keyword.')
  .max(3, 'You can supply up to 3 keywords.');

const keywordList = z.union([keywordString, keywordArray]).optional();

function toKeywordArray(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return [];
}

function pickKeywordArray(...candidates: Array<string | string[] | undefined>): string[] {
  for (const candidate of candidates) {
    const resolved = toKeywordArray(candidate);
    if (resolved.length > 0) {
      return resolved;
    }
  }
  return [];
}

export const autocompleteInputSchema = z
  .object({
    query: keywordString.optional(),
    queries: keywordArray.optional(),
    keyword: keywordString.optional(),
    keywords: keywordList,
  })
  .superRefine((data, ctx) => {
    const hasQuery = typeof data.query === 'string' && data.query.length > 0;
    const hasQueries = Array.isArray(data.queries) && data.queries.length > 0;
    const hasKeyword = typeof data.keyword === 'string' && data.keyword.length > 0;
    const hasKeywords = Array.isArray(data.keywords)
      ? data.keywords.length > 0
      : typeof data.keywords === 'string' && data.keywords.length > 0;
    if (!hasQuery && !hasQueries && !hasKeyword && !hasKeywords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either "query", "queries", "keyword", or "keywords" with at least one entry.',
        path: ['query'],
      });
    }
  })
  .transform((data) => ({
    queries: pickKeywordArray(data.queries, data.keywords, data.query, data.keyword),
  }));

const trendLikeInputSchema = z
  .object({
    keyword: keywordString.optional(),
    keywords: keywordList,
    geo: z.string().max(32).optional(),
    timeRange: z.string().min(1).optional(),
    category: z.number().int().min(0).optional(),
    property: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasKeyword = typeof data.keyword === 'string' && data.keyword.length > 0;
    const hasKeywords = Array.isArray(data.keywords)
      ? data.keywords.length > 0
      : typeof data.keywords === 'string' && data.keywords.length > 0;
    if (!hasKeyword && !hasKeywords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either "keyword" or "keywords" with at least one entry.',
        path: ['keyword'],
      });
    }
  })
  .transform((data) => ({
    keywords: pickKeywordArray(data.keywords, data.keyword),
    geo: data.geo,
    timeRange: data.timeRange,
    category: data.category,
    property: data.property,
  }));

export const trendIndexInputSchema = trendLikeInputSchema;
export const relatedQueriesInputSchema = trendLikeInputSchema;
export const relatedTopicsInputSchema = trendLikeInputSchema;

export const keywordClustersInputSchema = z
  .object({
    query: keywordString.optional(),
    siteUrl: z.string().url('siteUrl must be a valid URL.'),
    timeRange: z.string().min(1).optional(),
    includeAutocomplete: z.boolean().optional(),
    geo: z.string().max(32).optional(),
    maxKeywords: z.number().int().min(1).max(5000).optional(),
  })
  .transform((data) => ({
    query: data.query?.trim() ?? '',
    siteUrl: data.siteUrl,
    timeRange: data.timeRange ?? 'last_90_days',
    includeAutocomplete: data.includeAutocomplete ?? true,
    geo: data.geo ?? 'US',
    maxKeywords: data.maxKeywords ?? 2000,
  }));

export type AutocompleteInput = z.infer<typeof autocompleteInputSchema>;
export type TrendIndexInput = z.infer<typeof trendIndexInputSchema>;
export type RelatedQueriesInput = z.infer<typeof relatedQueriesInputSchema>;
export type RelatedTopicsInput = z.infer<typeof relatedTopicsInputSchema>;
export type KeywordClustersInput = z.infer<typeof keywordClustersInputSchema>;
