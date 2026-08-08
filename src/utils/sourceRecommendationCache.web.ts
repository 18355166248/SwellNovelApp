/** Web 预览使用 localStorage，与真机的文件缓存保持同一份数据结构。 */
import type { SourceRecommendation } from '../services/discover/sourceRecommendations';

const CACHE_KEY = 'nvl-source-recommendations-v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachePayload = { savedAt: number; items: SourceRecommendation[] };

function validItems(value: unknown): SourceRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SourceRecommendation =>
      !!item &&
      typeof item.url === 'string' &&
      typeof item.title === 'string' &&
      typeof item.sourceName === 'string',
  );
}

export async function loadSourceRecommendationCache(): Promise<SourceRecommendation[]> {
  try {
    const payload = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null') as CachePayload | null;
    if (!payload?.savedAt || Date.now() - payload.savedAt > MAX_AGE_MS) return [];
    return validItems(payload.items);
  } catch {
    return [];
  }
}

export async function saveSourceRecommendationCache(items: SourceRecommendation[]): Promise<void> {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
}
