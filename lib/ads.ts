import { GoogleAdsApi } from 'google-ads-api';
import type { ForecastInput, HistoricalMetricsInput, KeywordIdeasInput } from './schemas';
import { assertEnv } from './schemas';

export class AdsApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
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
      customer_account_id: customerId,
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

export async function keywordIdeas(
  input: KeywordIdeasInput & { refreshToken: string }
): Promise<
  Array<{
    text: string;
    metrics: Record<string, unknown>;
    competition: string | null;
    lowTopOfPageBidMicros: number | null;
    highTopOfPageBidMicros: number | null;
  }>
> {
  const customer = getCustomerInstance({ customerId: input.customerId, refreshToken: input.refreshToken });
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
    if (input.keywords && input.keywords.length > 0) {
      request.keywordSeed = { keywords: input.keywords };
    }
    if (input.urlSeed) {
      request.urlSeed = { url: input.urlSeed };
    }

    const ideas = await (customer.keywordPlans.generateKeywordIdeas as any)(request);
    return (ideas || []).map((idea: any) => {
      const metrics = idea.keywordIdeaMetrics ?? idea.metrics ?? {};
      return {
        text: idea.text ?? idea.keyword ?? idea.keywordIdea ?? '',
        metrics: {
          avgMonthlySearches: metrics.avgMonthlySearches ?? metrics.avg_monthly_searches ?? null,
          competitionIndex: metrics.competitionIndex ?? metrics.competition_index ?? null,
          competition: metrics.competition ?? null,
          lowTopOfPageBidMicros: metrics.lowTopOfPageBidMicros ?? metrics.low_top_of_page_bid_micros ?? null,
          highTopOfPageBidMicros: metrics.highTopOfPageBidMicros ?? metrics.high_top_of_page_bid_micros ?? null,
        },
        competition: metrics.competition ?? null,
        lowTopOfPageBidMicros: metrics.lowTopOfPageBidMicros ?? metrics.low_top_of_page_bid_micros ?? null,
        highTopOfPageBidMicros: metrics.highTopOfPageBidMicros ?? metrics.high_top_of_page_bid_micros ?? null,
      };
    });
  } catch (error) {
    throw mapGoogleError('get_keyword_ideas', error);
  }
}

export async function historicalMetrics(
  input: HistoricalMetricsInput & { refreshToken: string }
): Promise<
  Array<{
    text: string;
    metrics: Record<string, unknown>;
  }>
> {
  const customer = getCustomerInstance({ customerId: input.customerId, refreshToken: input.refreshToken });
  try {
    const request: Record<string, unknown> = {
      customerId: input.customerId,
      keywordPlanNetwork: input.network,
      keywords: input.keywords,
      geoTargetConstants: input.locationIds.map(toGeoTargetConstant),
      language: toLanguageConstant(input.languageId),
    };

    const response = await (customer.keywordPlanIdeas.generateHistoricalMetrics as any)(request);
    const metrics = Array.isArray(response?.metrics) ? response.metrics : response;
    return (metrics || []).map((item: any) => ({
      text: item.text ?? item.keyword ?? '',
      metrics: {
        avgMonthlySearches: item.metrics?.avgMonthlySearches ?? item.metrics?.avg_monthly_searches ?? null,
        competition: item.metrics?.competition ?? null,
        competitionIndex: item.metrics?.competitionIndex ?? item.metrics?.competition_index ?? null,
        lowTopOfPageBidMicros: item.metrics?.lowTopOfPageBidMicros ?? item.metrics?.low_top_of_page_bid_micros ?? null,
        highTopOfPageBidMicros: item.metrics?.highTopOfPageBidMicros ?? item.metrics?.high_top_of_page_bid_micros ?? null,
      },
    }));
  } catch (error) {
    throw mapGoogleError('get_historical_metrics', error);
  }
}

export async function forecast(
  input: ForecastInput & { refreshToken: string }
): Promise<
  Array<{
    keyword: string;
    dailyMetrics: Record<string, unknown>;
    weeklyMetrics: Record<string, unknown> | null;
  }>
> {
  const customer = getCustomerInstance({ customerId: input.customerId, refreshToken: input.refreshToken });
  try {
    const campaign = {
      cpcBidMicros: input.cpcBidMicros,
      dailyBudgetMicros: input.dailyBudgetMicros,
      keywordPlanNetwork: input.network,
      geoTargets: input.locationIds.map(toGeoTargetConstant),
      language: toLanguageConstant(input.languageId),
    };

    const plan = await (customer.keywordPlans.generateForecastMetrics as any)({
      customerId: input.customerId,
      plan: {
        campaign,
        keywords: input.keywords,
        forecastPeriod: input.startDate || input.endDate ? { startDate: input.startDate, endDate: input.endDate } : undefined,
      },
    });

    const forecastMetrics = Array.isArray(plan?.keywords) ? plan.keywords : plan;
    return (forecastMetrics || []).map((item: any) => ({
      keyword: item.keyword ?? item.text ?? '',
      dailyMetrics: {
        clicks: item.metrics?.clicks ?? item.metrics?.clicksPerDay ?? null,
        impressions: item.metrics?.impressions ?? null,
        costMicros: item.metrics?.costMicros ?? item.metrics?.cost_micros ?? null,
        conversions: item.metrics?.conversions ?? null,
      },
      weeklyMetrics: item.metrics?.weeklyMetrics ?? null,
    }));
  } catch (error) {
    throw mapGoogleError('get_forecast', error);
  }
}
