import { z } from 'zod';

const keywordString = z
  .string()
  .min(1, 'keywords must not be empty.')
  .max(512, 'keywords must be 512 characters or fewer.');

export const autocompleteInputSchema = z
  .object({
    query: keywordString.optional(),
    queries: z
      .array(keywordString)
      .min(1, 'Provide at least one keyword.')
      .max(3, 'You can supply up to 3 keywords.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasQuery = typeof data.query === 'string' && data.query.length > 0;
    const hasQueries = Array.isArray(data.queries) && data.queries.length > 0;
    if (!hasQuery && !hasQueries) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either "query" or "queries" with at least one keyword.',
        path: ['query'],
      });
    }
  })
  .transform((data) => ({
    queries: data.queries ?? (data.query ? [data.query] : []),
  }));

export const trendIndexInputSchema = z
  .object({
    keyword: keywordString.optional(),
    keywords: z
      .array(keywordString)
      .min(1, 'Provide at least one keyword.')
      .max(3, 'You can supply up to 3 keywords.')
      .optional(),
    geo: z.string().max(32).optional(),
    timeRange: z.string().min(1).optional(),
    category: z.number().int().min(0).optional(),
    property: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasKeyword = typeof data.keyword === 'string' && data.keyword.length > 0;
    const hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
    if (!hasKeyword && !hasKeywords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either "keyword" or "keywords" with at least one entry.',
        path: ['keyword'],
      });
    }
  })
  .transform((data) => ({
    keywords: data.keywords ?? (data.keyword ? [data.keyword] : []),
    geo: data.geo,
    timeRange: data.timeRange,
    category: data.category,
    property: data.property,
  }));

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
export type KeywordClustersInput = z.infer<typeof keywordClustersInputSchema>;
