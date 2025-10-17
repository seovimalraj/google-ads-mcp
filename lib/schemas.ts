import { z } from 'zod';

export const autocompleteInputSchema = z.object({
  query: z.string().min(1, 'query is required.').max(512, 'query must be 512 characters or fewer.'),
});

export const trendIndexInputSchema = z.object({
  keyword: z.string().min(1, 'keyword is required.'),
  geo: z.string().max(32).optional(),
  timeRange: z.string().min(1).optional(),
  category: z.number().int().min(0).optional(),
  property: z.string().optional(),
});

export type AutocompleteInput = z.infer<typeof autocompleteInputSchema>;
export type TrendIndexInput = z.infer<typeof trendIndexInputSchema>;
