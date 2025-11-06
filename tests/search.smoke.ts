import assert from 'node:assert/strict';
import { fetchAutocompleteSuggestions, fetchTrendIndex } from '../lib/search';

type MockPayload = {
  status: number;
  json?: unknown;
  text?: string;
};

class MockResponse {
  status: number;
  headers = new Map<string, string>();
  private readonly body: MockPayload;

  constructor(payload: MockPayload) {
    this.status = payload.status;
    this.body = payload;
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  async json() {
    if (this.body.json !== undefined) {
      return this.body.json;
    }
    if (this.body.text !== undefined) {
      return JSON.parse(this.body.text);
    }
    throw new Error('No JSON mock body configured.');
  }

  async text() {
    if (this.body.text !== undefined) {
      return this.body.text;
    }
    if (this.body.json !== undefined) {
      return JSON.stringify(this.body.json);
    }
    return '';
  }
}

async function run() {
  const queue: MockResponse[] = [];

  global.fetch = (async () => {
    throw new Error('fetch not initialised');
  }) as typeof fetch;

  function enqueueResponse(payload: MockPayload) {
    queue.push(new MockResponse(payload));
  }

  global.fetch = (async () => {
    const response = queue.shift();
    if (!response) {
      throw new Error('No mock response queued.');
    }
    return response as unknown as Response;
  }) as typeof fetch;

  enqueueResponse({
    status: 200,
    json: [
      'toroidal transformer',
      ['toroidal transformer winding', 42, 'toroidal transformer core'],
    ],
  });

  const autocomplete = await fetchAutocompleteSuggestions('toroidal transformer');
  assert.equal(autocomplete.query, 'toroidal transformer');
  assert.deepEqual(autocomplete.suggestions, [
    'toroidal transformer winding',
    'toroidal transformer core',
  ]);

  enqueueResponse({
    status: 200,
    text: ')]}\'\n{"widgets":[{"id":"TIMESERIES","token":"token123","request":{"comparisonItem":[{"keyword":"toroidal transformer","geo":"US","time":"today 12-m"}],"category":0,"property":""}}]}',
  });

  enqueueResponse({
    status: 200,
    text: ')]}\'\n{"default":{"timelineData":[{"time":"1704067200","formattedTime":"Dec 31, 2023","value":[37],"formattedValue":["37"]},{"time":"1704672000","formattedTime":"Jan 7 – Jan 13, 2024","value":[42],"formattedValue":["42"]}],"averages":[40],"legend":["toroidal transformer"]}}',
  });

  const trend = await fetchTrendIndex({
    keywords: ['toroidal transformer'],
    geo: 'US',
    timeRange: 'today 12-m',
  });
  assert.equal(trend.keyword, 'toroidal transformer');
  assert.deepEqual(trend.keywords, ['toroidal transformer']);
  assert.equal(trend.geo, 'US');
  assert.equal(trend.timeRange, 'today 12-m');
  assert.deepEqual(trend.seriesLabels, ['toroidal transformer']);
  assert.deepEqual(trend.averages, [40]);
  assert.equal(trend.points.length, 2);
  assert.deepEqual(trend.points[0], {
    time: '1704067200',
    formattedTime: 'Dec 31, 2023',
    values: [37],
  });

  console.log('search smoke tests passed');
}

void run();
