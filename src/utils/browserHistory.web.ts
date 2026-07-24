/** Web 预览端使用 localStorage；真机端由 browserHistory.ts 写入应用沙盒。 */
const KEY = 'nvl-browser-history-v1';
const MAX_HISTORY = 8;

export async function loadBrowserHistory(): Promise<string[]> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === 'string').slice(0, MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
}

export async function saveBrowserHistory(urls: string[]): Promise<void> {
  window.localStorage.setItem(KEY, JSON.stringify(urls.slice(0, MAX_HISTORY)));
}

export function addBrowserHistory(urls: string[], url: string): string[] {
  if (!/^https?:\/\//i.test(url)) return urls;
  return [url, ...urls.filter(item => item !== url)].slice(0, MAX_HISTORY);
}
