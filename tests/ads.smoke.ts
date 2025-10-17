import assert from 'node:assert/strict';
import {
  normalizeKeywordIdeasResponse,
  normalizeHistoricalMetricsResponse,
  normalizeForecastResponse,
} from '../lib/ads-normalizers';

const keywordIdeasResponse = {
  results: [
    {
      text: 'keyword idea',
      keywordIdeaMetrics: {
        avgMonthlySearches: 1200,
        competitionIndex: 25,
        competition: 'LOW',
        lowTopOfPageBidMicros: 1500000,
        highTopOfPageBidMicros: 3200000,
      },
    },
  ],
};

const normalizedIdeas = normalizeKeywordIdeasResponse(keywordIdeasResponse);
assert.equal(normalizedIdeas.length, 1);
assert.deepEqual(normalizedIdeas[0], {
  text: 'keyword idea',
  metrics: {
    avgMonthlySearches: 1200,
    competitionIndex: 25,
    competition: 'LOW',
    lowTopOfPageBidMicros: 1500000,
    highTopOfPageBidMicros: 3200000,
  },
  competition: 'LOW',
  lowTopOfPageBidMicros: 1500000,
  highTopOfPageBidMicros: 3200000,
});

const historicalMetricsResponse = {
  results: [
    {
      text: 'historical keyword',
      keywordMetrics: {
        avgMonthlySearches: 4500,
        competition: 'MEDIUM',
        competitionIndex: 42,
        lowTopOfPageBidMicros: 2100000,
        highTopOfPageBidMicros: 4100000,
      },
    },
  ],
};

const normalizedHistorical = normalizeHistoricalMetricsResponse(historicalMetricsResponse);
assert.equal(normalizedHistorical.length, 1);
assert.deepEqual(normalizedHistorical[0], {
  text: 'historical keyword',
  metrics: {
    avgMonthlySearches: 4500,
    competition: 'MEDIUM',
    competitionIndex: 42,
    lowTopOfPageBidMicros: 2100000,
    highTopOfPageBidMicros: 4100000,
  },
});

const keywordForecastResponse = {
  keywordForecasts: [
    {
      keyword: { text: 'forecast keyword' },
      metrics: {
        clicks: 12.3,
        impressions: 456.7,
        costMicros: 8900000,
        conversions: 1.1,
      },
    },
  ],
};

const normalizedForecast = normalizeForecastResponse(keywordForecastResponse, ['forecast keyword']);
assert.equal(normalizedForecast.length, 1);
assert.deepEqual(normalizedForecast[0], {
  keyword: 'forecast keyword',
  dailyMetrics: {
    clicks: 12.3,
    impressions: 456.7,
    costMicros: 8900000,
    conversions: 1.1,
  },
  weeklyMetrics: null,
});

const aggregatedForecastResponse = {
  campaignForecastMetrics: {
    clicks: 5.6,
    impressions: 123.4,
    costMicros: 2300000,
    conversions: 0.4,
  },
};

const normalizedAggregatedForecast = normalizeForecastResponse(aggregatedForecastResponse, []);
assert.equal(normalizedAggregatedForecast.length, 1);
assert.deepEqual(normalizedAggregatedForecast[0], {
  keyword: 'CAMPAIGN_TOTAL',
  dailyMetrics: {
    clicks: 5.6,
    impressions: 123.4,
    costMicros: 2300000,
    conversions: 0.4,
  },
  weeklyMetrics: null,
});

console.log('ads smoke tests passed');
