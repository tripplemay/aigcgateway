// channels 内存缓存 + singleflight
// 独立文件避免 Next.js route export 限制

const CACHE_TTL_MS = 30_000;
let cachedResponse: { json: string; expiresAt: number } | null = null;
let inflightQuery: Promise<string> | null = null;

export function getCachedChannels(): string | null {
  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return cachedResponse.json;
  }
  return null;
}

export function getInflightQuery(): Promise<string> | null {
  return inflightQuery;
}

export function setInflightQuery(promise: Promise<string>): void {
  inflightQuery = promise;
}

export function setCachedChannels(json: string): void {
  cachedResponse = { json, expiresAt: Date.now() + CACHE_TTL_MS };
}

export function clearInflightQuery(): void {
  inflightQuery = null;
}

export function invalidateChannelsCache(): void {
  cachedResponse = null;
}
