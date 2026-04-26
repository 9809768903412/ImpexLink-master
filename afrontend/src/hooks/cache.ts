type CacheEntry<T> = { data: T; ts: number };
const cache = new Map<string, CacheEntry<unknown>>();

export function getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return cache.get(key) as CacheEntry<T> | undefined;
}

export function getCache<T>(key: string, staleTimeMs = 0): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (staleTimeMs && Date.now() - entry.ts > staleTimeMs) return undefined;
  return entry.data;
}

export function setCache<T>(key: string, value: T) {
  cache.set(key, { data: value, ts: Date.now() });
}
