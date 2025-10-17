import { z } from 'zod';

const idSchema = z.union([z.string().min(1), z.number()]).transform((value) => value.toString());

export const AdsNetworkEnum = z.enum([
  'GOOGLE_SEARCH',
  'GOOGLE_SEARCH_AND_PARTNERS',
  'GOOGLE_DISPLAY_NETWORK',
  'YOUTUBE_SEARCH',
  'YOUTUBE_VIDEOS',
]);

export const keywordIdeasInputSchema = z
  .object({
    userId: z.string().min(1, 'userId is required.'),
    customerId: z.string().min(1, 'customerId is required.'),
    keywords: z.array(z.string().min(1)).optional(),
    urlSeed: z.string().url().optional(),
    locationIds: z.array(idSchema).min(1, 'At least one locationId is required.'),
    languageId: idSchema,
    network: AdsNetworkEnum.optional(),
    pageSize: z.number().int().positive().max(8000).optional(),
  })
  .superRefine((value, ctx) => {
    if ((!value.keywords || value.keywords.length === 0) && !value.urlSeed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keywords'],
        message: 'Provide either keywords[] or urlSeed.',
      });
    }
  });

export const historicalMetricsInputSchema = z.object({
  userId: z.string().min(1),
  customerId: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1, 'keywords[] is required.'),
  locationIds: z.array(idSchema).min(1, 'At least one locationId is required.'),
  languageId: idSchema,
  network: AdsNetworkEnum.optional(),
});

export const forecastInputSchema = z
  .object({
    userId: z.string().min(1),
    customerId: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1, 'keywords[] is required.'),
    cpcBidMicros: z.number().int().positive().optional(),
    dailyBudgetMicros: z.number().int().positive().optional(),
    locationIds: z.array(idSchema).min(1, 'At least one locationId is required.'),
    languageId: idSchema,
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    network: AdsNetworkEnum.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'startDate must be before endDate.',
      });
    }
  });

export const envSchema = z
  .object({
    GADS_CLIENT_ID: z.string().min(1, 'GADS_CLIENT_ID is required'),
    GADS_CLIENT_SECRET: z.string().min(1, 'GADS_CLIENT_SECRET is required'),
    GADS_DEV_TOKEN: z.string().min(1, 'GADS_DEV_TOKEN is required'),
    GADS_LOGIN_CUSTOMER_ID: z.string().optional(),
    ENCRYPTION_KEY: z
      .string()
      .min(1, 'ENCRYPTION_KEY is required')
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'ENCRYPTION_KEY must be a base64 string that decodes to 32 bytes.',
      }),
    REDIS_REST_URL: z.string().optional(),
    REDIS_REST_TOKEN: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    KV_REST_API_URL: z.string().optional(),
    KV_REST_API_TOKEN: z.string().optional(),
    KV_REST_API_READ_ONLY_TOKEN: z.string().optional(),
    NEXT_PUBLIC_APP_NAME: z.string().min(1, 'NEXT_PUBLIC_APP_NAME is required'),
  })
  .passthrough();

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function assertEnv(): Env {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

export type KeywordIdeasInput = z.infer<typeof keywordIdeasInputSchema>;
export type HistoricalMetricsInput = z.infer<typeof historicalMetricsInputSchema>;
export type ForecastInput = z.infer<typeof forecastInputSchema>;
