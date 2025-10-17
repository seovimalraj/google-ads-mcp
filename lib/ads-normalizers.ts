export function normalizeKeywordIdeasResponse(response: unknown): Array<{
  text: string;
  metrics: Record<string, unknown>;
  competition: string | null;
  lowTopOfPageBidMicros: number | null;
  highTopOfPageBidMicros: number | null;
}> {
  const results = Array.isArray((response as any)?.results)
    ? (response as any).results
    : Array.isArray(response)
      ? response
      : [];

  return results.map((idea: any) => {
    const metrics = idea?.keywordIdeaMetrics ?? idea?.metrics ?? {};
    const avgMonthlySearches = metrics?.avgMonthlySearches ?? metrics?.avg_monthly_searches ?? null;
    const competitionIndex = metrics?.competitionIndex ?? metrics?.competition_index ?? null;
    const competition = metrics?.competition ?? null;
    const lowTopOfPageBidMicros =
      metrics?.lowTopOfPageBidMicros ?? metrics?.low_top_of_page_bid_micros ?? null;
    const highTopOfPageBidMicros =
      metrics?.highTopOfPageBidMicros ?? metrics?.high_top_of_page_bid_micros ?? null;

    return {
      text: idea?.text ?? idea?.keyword ?? idea?.keywordIdea ?? '',
      metrics: {
        avgMonthlySearches,
        competitionIndex,
        competition,
        lowTopOfPageBidMicros,
        highTopOfPageBidMicros,
      },
      competition,
      lowTopOfPageBidMicros,
      highTopOfPageBidMicros,
    };
  });
}

export function normalizeHistoricalMetricsResponse(response: unknown): Array<{
  text: string;
  metrics: Record<string, unknown>;
}> {
  const results = Array.isArray((response as any)?.results)
    ? (response as any).results
    : Array.isArray((response as any)?.metrics)
      ? (response as any).metrics
      : Array.isArray(response)
        ? response
        : [];

  return results.map((item: any) => {
    const metrics = item?.keywordMetrics ?? item?.metrics ?? {};
    return {
      text: item?.text ?? item?.keyword ?? '',
      metrics: {
        avgMonthlySearches: metrics?.avgMonthlySearches ?? metrics?.avg_monthly_searches ?? null,
        competition: metrics?.competition ?? null,
        competitionIndex: metrics?.competitionIndex ?? metrics?.competition_index ?? null,
        lowTopOfPageBidMicros:
          metrics?.lowTopOfPageBidMicros ?? metrics?.low_top_of_page_bid_micros ?? null,
        highTopOfPageBidMicros:
          metrics?.highTopOfPageBidMicros ?? metrics?.high_top_of_page_bid_micros ?? null,
      },
    };
  });
}

export function normalizeForecastResponse(
  response: unknown,
  fallbackKeywords: string[],
): Array<{
  keyword: string;
  dailyMetrics: Record<string, unknown>;
  weeklyMetrics: Record<string, unknown> | null;
}> {
  const forecasts = Array.isArray((response as any)?.keywordForecasts)
    ? (response as any).keywordForecasts
    : Array.isArray((response as any)?.keywords)
      ? (response as any).keywords
      : Array.isArray(response)
        ? response
        : [];

  const normalized = forecasts.map((item: any, index: number) => {
    const keywordCandidate =
      item?.keyword?.text ??
      item?.keywordText ??
      item?.keyword ??
      item?.searchQuery ??
      fallbackKeywords[index] ??
      '';

    const metrics = item?.metrics ?? item?.metric ?? item?.keywordForecastMetrics ?? item ?? {};

    const clicks = metrics?.clicksPerDay ?? metrics?.dailyClicks ?? metrics?.clicks ?? null;
    const impressions = metrics?.impressions ?? metrics?.dailyImpressions ?? null;
    const costMicros = metrics?.costMicros ?? metrics?.cost ?? metrics?.dailyCostMicros ?? null;
    const conversions = metrics?.conversions ?? metrics?.dailyConversions ?? null;

    return {
      keyword: keywordCandidate,
      dailyMetrics: {
        clicks,
        impressions,
        costMicros,
        conversions,
      },
      weeklyMetrics: metrics?.weeklyMetrics ?? metrics?.weekly ?? null,
    };
  });

  if (normalized.length === 0) {
    const campaignMetrics =
      (response as any)?.campaignForecastMetrics ??
      (response as any)?.campaign_forecast_metrics ??
      (response as any)?.keywordForecastMetrics ??
      null;
    if (campaignMetrics) {
      normalized.push({
        keyword: 'CAMPAIGN_TOTAL',
        dailyMetrics: {
          clicks:
            campaignMetrics?.clicksPerDay ??
            campaignMetrics?.dailyClicks ??
            campaignMetrics?.clicks ??
            null,
          impressions: campaignMetrics?.impressions ?? campaignMetrics?.dailyImpressions ?? null,
          costMicros:
            campaignMetrics?.costMicros ??
            campaignMetrics?.cost ??
            campaignMetrics?.dailyCostMicros ??
            null,
          conversions: campaignMetrics?.conversions ?? campaignMetrics?.dailyConversions ?? null,
        },
        weeklyMetrics: campaignMetrics?.weeklyMetrics ?? campaignMetrics?.weekly ?? null,
      });
    }
  }

  return normalized;
}
