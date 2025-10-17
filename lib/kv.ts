import { Redis } from '@upstash/redis';

import { AuthToken } from '@/types';

interface RedisConfig {
  url: string;
  token: string;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const memoryStore = new Map<string, AuthToken>();
let redisClient: RedisClient | null = null;
let storeMode: 'redis' | 'memory' | null = null;

function createRedisClient(): RedisClient | null {
  if (redisClient) {
    return redisClient;
  }

  const url =
    process.env.REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    null;
  const token =
    process.env.REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    null;

  if (!url || !token) {
    storeMode = 'memory';
    console.warn(
      '[redis] Redis credentials missing. Falling back to in-memory storage. Tokens will not persist across deployments.',
    );
    redisClient = {
      async get(key: string) {
        return memoryStore.has(key) ? JSON.stringify(memoryStore.get(key)) : null;
      },
      async set(key: string, value: string) {
        const parsed = JSON.parse(value) as AuthToken;
        memoryStore.set(key, parsed);
      },
    };
    return redisClient;
  }

  storeMode = 'redis';
  const config: RedisConfig = {
    url: url.replace(/\/$/, ''),
    token,
  };

  const client = new Redis({ url: config.url, token: config.token });

  redisClient = {
    async get(key: string) {
      const result = await client.get<string | null>(key);
      if (typeof result === 'string') {
        return result;
      }
      return result ?? null;
    },
    async set(key: string, value: string) {
      await client.set(key, value);
    },
  };

  return redisClient;
}

function getKvKey(userId: string): string {
  return `ads-mcp:user:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getAuthToken(userId: string): Promise<AuthToken | null> {
  const client = createRedisClient();
  const key = getKvKey(userId);
  if (storeMode === 'memory') {
    return memoryStore.get(key) ?? null;
  }

  const raw = await client?.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthToken;
  } catch (error) {
    console.error('[redis] Failed to parse auth token payload', { error });
    return null;
  }
}

export async function setAuthToken(
  token: Omit<AuthToken, 'createdAt' | 'updatedAt'> &
    Partial<Pick<AuthToken, 'createdAt' | 'updatedAt'>>,
): Promise<AuthToken> {
  const existing = await getAuthToken(token.userId);
  const record: AuthToken = {
    userId: token.userId,
    customerId: token.customerId,
    refreshTokenEnc: token.refreshTokenEnc,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  const key = getKvKey(token.userId);
  const client = createRedisClient();
  const payload = JSON.stringify(record);

  if (storeMode === 'memory') {
    memoryStore.set(key, record);
    return record;
  }

  await client?.set(key, payload);
  return record;
}

export function kvStatus(): 'redis' | 'memory' | null {
  createRedisClient();
  return storeMode;
}
