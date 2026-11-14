import { createHash } from 'node:crypto';

interface CacheEntry {
  content: string;
  etag: string;
  flowHeader?: string;
  filename: string;
  createdAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const store = new Map<string, CacheEntry>();

export function computeEtag(content: string): string {
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 16);
  return `"${hash}"`;
}

export function getCachedSubscription(key: string): CacheEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCachedSubscription(
  key: string,
  value: Omit<CacheEntry, 'etag' | 'createdAt'>,
): CacheEntry {
  const entry: CacheEntry = {
    ...value,
    etag: computeEtag(value.content),
    createdAt: Date.now(),
  };
  store.set(key, entry);
  return entry;
}

export function invalidateSubscriptionCache(): void {
  store.clear();
}
