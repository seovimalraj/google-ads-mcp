import { AuthToken } from '@/types';

interface KvConfig {
  url: string;
  token: string;
  readOnlyToken?: string;
}

interface KvClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const memoryStore = new Map<string, AuthToken>();
let kvClient: KvClient | null = null;
let kvMode: 'vercel' | 'memory' | null = null;

function createKvClient(): KvClient | null {
  if (kvClient) {
    return kvClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const readOnlyToken = process.env.KV_REST_API_READ_ONLY_TOKEN;

  if (!url || !token) {
    kvMode = 'memory';
    console.warn(
      '[kv] KV_REST_API_URL or KV_REST_API_TOKEN missing. Falling back to in-memory KV. Tokens will not persist across deployments.',
    );
    kvClient = {
      async get(key: string) {
        return memoryStore.has(key) ? JSON.stringify(memoryStore.get(key)) : null;
      },
      async set(key: string, value: string) {
        const parsed = JSON.parse(value) as AuthToken;
        memoryStore.set(key, parsed);
      },
    };
    return kvClient;
  }

  kvMode = 'vercel';
  const config: KvConfig = {
    url: url.replace(/\/$/, ''),
    token,
    readOnlyToken: readOnlyToken || undefined,
  };

  kvClient = {
    async get(key: string) {
      const response = await fetch(`${config.url}/get/${encodeURIComponent(key)}`, {
        headers: {
          Authorization: `Bearer ${config.readOnlyToken ?? config.token}`,
        },
        cache: 'no-store',
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`KV get failed with status ${response.status}`);
      }
      const body = (await response.json()) as { result: string | null };
      return body.result ?? null;
    },
    async set(key: string, value: string) {
      const response = await fetch(`${config.url}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'text/plain',
        },
        body: value,
        cache: 'no-store',
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`KV set failed (${response.status}): ${text}`);
      }
    },
  };

  return kvClient;
}

function getKvKey(userId: string): string {
  return `ads-mcp:user:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getAuthToken(userId: string): Promise<AuthToken | null> {
  const client = createKvClient();
  const key = getKvKey(userId);
  if (kvMode === 'memory') {
    return memoryStore.get(key) ?? null;
  }

  const raw = await client?.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthToken;
  } catch (error) {
    console.error('[kv] Failed to parse auth token payload', { error });
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
  const client = createKvClient();
  const payload = JSON.stringify(record);

  if (kvMode === 'memory') {
    memoryStore.set(key, record);
    return record;
  }

  await client?.set(key, payload);
  return record;
}

export function kvStatus(): 'vercel' | 'memory' | null {
  createKvClient();
  return kvMode;
}
