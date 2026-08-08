/** 发现页推荐缓存：原生端存入应用沙盒，启动时先展示最近一次成功结果。 */
import RNFS from 'react-native-fs';
import type { SourceRecommendation } from '../services/discover/sourceRecommendations';

const CACHE_PATH = `${RNFS.DocumentDirectoryPath}/source-recommendations-v1.json`;
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
    if (!(await RNFS.exists(CACHE_PATH))) return [];
    const payload = JSON.parse(await RNFS.readFile(CACHE_PATH, 'utf8')) as CachePayload;
    if (!payload.savedAt || Date.now() - payload.savedAt > MAX_AGE_MS) return [];
    return validItems(payload.items);
  } catch {
    return [];
  }
}

export async function saveSourceRecommendationCache(items: SourceRecommendation[]): Promise<void> {
  await RNFS.writeFile(CACHE_PATH, JSON.stringify({ savedAt: Date.now(), items }), 'utf8');
}
