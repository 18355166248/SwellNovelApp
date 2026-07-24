/** 内置浏览器最近访问地址：原生端存应用沙盒，避免每次都从搜索页重新找书。 */
import RNFS from 'react-native-fs';

const HISTORY_PATH = `${RNFS.DocumentDirectoryPath}/browser-history-v1.json`;
const MAX_HISTORY = 8;

export async function loadBrowserHistory(): Promise<string[]> {
  try {
    if (!(await RNFS.exists(HISTORY_PATH))) return [];
    const parsed = JSON.parse(await RNFS.readFile(HISTORY_PATH, 'utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === 'string').slice(0, MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
}

export async function saveBrowserHistory(urls: string[]): Promise<void> {
  await RNFS.writeFile(HISTORY_PATH, JSON.stringify(urls.slice(0, MAX_HISTORY)), 'utf8');
}

export function addBrowserHistory(urls: string[], url: string): string[] {
  if (!/^https?:\/\//i.test(url)) return urls;
  return [url, ...urls.filter(item => item !== url)].slice(0, MAX_HISTORY);
}
