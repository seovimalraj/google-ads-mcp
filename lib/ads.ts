import { GoogleAdsApi } from 'google-ads-api';
import {
  normalizeForecastResponse,
  normalizeHistoricalMetricsResponse,
  normalizeKeywordIdeasResponse,
} from './ads-normalizers';
import type { ForecastInput, HistoricalMetricsInput, KeywordIdeasInput } from './schemas';
import { assertEnv } from './schemas';

export {
  normalizeForecastResponse,
  normalizeHistoricalMetricsResponse,
  normalizeKeywordIdeasResponse,
} from './ads-normalizers';

export class AdsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AdsApiError';
  }
}

let client: GoogleAdsApi | null = null;

function getClient(): GoogleAdsApi {
  if (!client) {
    const env = assertEnv();
    client = new GoogleAdsApi({
      client_id: env.GADS_CLIENT_ID,
      client_secret: env.GADS_CLIENT_SECRET,
      developer_token: env.GADS_DEV_TOKEN,
    });
  }
  return client;
}

function extractErrorCode(error: any): string {
  if (!error || typeof error !== 'object') {
    return 'UNKNOWN';
  }
  if (typeof error.code === 'string') {
    return error.code;
  }
  if (typeof error.status === 'string') {
    return error.status;
  }
  const firstDetail = Array.isArray(error.details) ? error.details[0] : undefined;
  const firstError = firstDetail?.errors ? firstDetail.errors[0] : undefined;
  if (firstError?.errorCode) {
    const codeKeys = Object.keys(firstError.errorCode);
    if (codeKeys.length > 0) {
      return codeKeys[0];
    }
  }
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return extractErrorCode(error.errors[0]);
  }
  return 'UNKNOWN';
}

function mapGoogleError(operation: string, error: unknown): AdsApiError {
  if (error instanceof AdsApiError) {
    return error;
  }
  const code = extractErrorCode(error as Record<string, unknown>);
  const baseMessage = error instanceof Error ? error.message : String(error);
  const message = baseMessage || `Failed to execute ${operation}.`;
  return new AdsApiError(code, message, error);
}

interface CustomerOptions {
  customerId: string;
  refreshToken: string;
}

type Customer = ReturnType<GoogleAdsApi['Customer']>;

function getCustomerInstance({ customerId, refreshToken }: CustomerOptions): Customer {
  try {
    const env = assertEnv();
    const googleAds = getClient();
    return googleAds.Customer({
      customer_id: customerId,
      login_customer_id: env.GADS_LOGIN_CUSTOMER_ID || undefined,
      refresh_token: refreshToken,
    });
  } catch (error) {
    throw mapGoogleError('customer initialization', error);
  }
}

function toGeoTargetConstant(id: string): string {
  return id.startsWith('geoTargetConstants/') ? id : `geoTargetConstants/${id}`;
}

function toLanguageConstant(id: string): string {
  return id.startsWith('languageConstants/') ? id : `languageConstants/${id}`;
}

const DEFAULT_FORECAST_CPC_MICROS = 1_000_000;

export async function keywordIdeas(input: KeywordIdeasInput & { refreshToken: string }): Promise<
  Array<{
    text: string;
    metrics: Record<string, unknown>;
    competition: string | null;
    lowTopOfPageBidMicros: number | null;
    highTopOfPageBidMicros: number | null;
  }>
> {
  const customer = getCustomerInstance({
    customerId: input.customerId,
    refreshToken: input.refreshToken,
  });
  try {
    const request: Record<string, unknown> = {
      customerId: input.customerId,
      language: toLanguageConstant(input.languageId),
      geoTargetConstants: input.locationIds.map(toGeoTargetConstant),
      includeAdultKeywords: false,
    };

    if (input.network) {
      request.keywordPlanNetwork = input.network;
    }
    if (input.pageSize) {
      request.pageSize = input.pageSize;
    }
    if (input.keywords && input.keywords.length > 0 && input.urlSeed) {
      request.keywordAndUrlSeed = { keywords: input.keywords, url: input.urlSeed };
    } else if (input.keywords && input.keywords.length > 0) {
      request.keywordSeed = { keywords: input.keywords };
    } else if (input.urlSeed) {
      request.urlSeed = { url: input.urlSeed };
    }

    const ideas = await (customer.keywordPlanIdeas.generateKeywordIdeas as any)(request);
    return normalizeKeywordIdeasResponse(ideas);
  } catch (error) {
    throw mapGoogleError('get_keyword_ideas', error);
  }
}

export async function historicalMetrics(
  input: HistoricalMetricsInput & { refreshToken: string },
): Promise<
  Array<{
    text: string;
    metrics: Record<string, unknown>;
  }>
> {
  const customer = getCustomerInstance({
    customerId: input.customerId,
    refreshToken: input.refreshToken,
  });
  try {
    const request: Record<string, unknown> = {
      customerId: input.customerId,
      keywords: input.keywords,
      geoTargetConstants: input.locationIds.map(toGeoTargetConstant),
      language: toLanguageConstant(input.languageId),
      includeAdultKeywords: false,
    };

    if (input.network) {
      request.keywordPlanNetwork = input.network;
    }

    const response = await (customer.keywordPlanIdeas.generateKeywordHistoricalMetrics as any)(
      request,
    );
    return normalizeHistoricalMetricsResponse(response);
  } catch (error) {
    throw mapGoogleError('get_historical_metrics', error);
  }
}

export async function forecast(input: ForecastInput & { refreshToken: string }): Promise<
  Array<{
    keyword: string;
    dailyMetrics: Record<string, unknown>;
    weeklyMetrics: Record<string, unknown> | null;
  }>
> {
  const customer = getCustomerInstance({
    customerId: input.customerId,
    refreshToken: input.refreshToken,
  });
  try {
    const manualCpcBidMicros = input.cpcBidMicros ?? DEFAULT_FORECAST_CPC_MICROS;

    const request: Record<string, unknown> = {
      customerId: input.customerId,
      forecastPeriod:
        input.startDate || input.endDate
          ? { startDate: input.startDate, endDate: input.endDate }
          : undefined,
      campaign: {
        languageConstants: [toLanguageConstant(input.languageId)],
        geoModifiers: input.locationIds.map((id) => ({
          geoTargetConstant: toGeoTargetConstant(id),
        })),
        keywordPlanNetwork: input.network ?? 'GOOGLE_SEARCH_AND_PARTNERS',
        biddingStrategy: {
          manualCpcBiddingStrategy: {
            maxCpcBidMicros: manualCpcBidMicros,
            dailyBudgetMicros: input.dailyBudgetMicros,
          },
        },
        adGroups: [
          {
            biddableKeywords: input.keywords.map((keyword) => {
              const entry: Record<string, unknown> = {
                keyword: {
                  text: keyword,
                  matchType: 'BROAD',
                },
              };
              if (input.cpcBidMicros) {
                entry.maxCpcBidMicros = input.cpcBidMicros;
              }
              return entry;
            }),
          },
        ],
      },
    };

    const response = await (customer.keywordPlanIdeas.generateKeywordForecastMetrics as any)(
      request,
    );
    return normalizeForecastResponse(response, input.keywords);
  } catch (error) {
    throw mapGoogleError('get_forecast', error);
  }
}
