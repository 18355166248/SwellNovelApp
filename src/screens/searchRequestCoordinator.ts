import {
  createLatestRequestTracker,
  RequestToken,
} from '../utils/latestRequest';

/**
 * 协调搜书页的搜索与入库请求：旧请求可以继续完成数据副作用，但只有最新请求能更新 UI。
 * addingUrl 单独保存在同步状态中，用来拦住 React 状态提交前的连续点击。
 */
export function createSearchRequestCoordinator() {
  const tracker = createLatestRequestTracker();
  let addingUrl: string | null = null;

  return {
    invalidate() {
      tracker.reset();
      addingUrl = null;
    },
    startSearch(): RequestToken {
      addingUrl = null;
      return tracker.start();
    },
    startAdding(url: string): RequestToken | null {
      if (addingUrl !== null) return null;
      const token = tracker.start();
      addingUrl = url;
      return token;
    },
    isLatest(token: RequestToken): boolean {
      return tracker.isLatest(token);
    },
    finishAdding(token: RequestToken): boolean {
      if (!tracker.isLatest(token)) return false;
      addingUrl = null;
      return true;
    },
    getAddingUrl(): string | null {
      return addingUrl;
    },
  };
}
