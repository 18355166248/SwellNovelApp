/** 小说站会通过顶层跳转带走搜索结果/目录，保护已适配站点的正常浏览链路。 */
// 当前页校验需要可写的 hash 和标准路径规范化；RN 自带 URL 不支持这些完整语义。
import { StandardURL as URL } from '../../utils/standardUrl';

function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol)
      ? parsed.hostname.toLowerCase()
      : '';
  } catch {
    return '';
  }
}

// 与注册书源的站点范围一致；不能只防护目录，首页搜索的结果页也会触发广告跳转。
const SOURCE_ROOTS = [
  'bookshuku.org',
  'mingzw.net',
  'xuanhuange.info',
  'bqquge.org',
];
function sourceRoot(host: string): string | undefined {
  return SOURCE_ROOTS.find(root => host === root || host.endsWith(`.${root}`));
}

export function isSameSiteNavigation(
  fromUrl: string,
  targetUrl: string,
): boolean {
  const from = hostOf(fromUrl);
  const target = hostOf(targetUrl);
  if (!from || !target) return true;
  // 已知书源的 www/wap/tw 是同站镜像，不能因拦广告误伤站内搜索与桌面/移动跳转。
  const root = sourceRoot(from);
  if (root) return sourceRoot(target) === root;
  return (
    target === from ||
    target.endsWith(`.${from}`) ||
    from.endsWith(`.${target}`)
  );
}

/** 用户输入新网址由可见浏览器单独放行；站点脚本的外域广告不继承该次许可。 */
export function shouldBlockAdNavigation(
  fromUrl: string,
  targetUrl: string,
): boolean {
  // 网页不应借 intent/itms-services 等协议唤起外部 App；内部空白 frame 保留给验证组件。
  if (targetUrl !== 'about:blank' && !/^https?:\/\//i.test(targetUrl))
    return true;
  return (
    !!sourceRoot(hostOf(fromUrl)) && !isSameSiteNavigation(fromUrl, targetUrl)
  );
}

/** 仅放行地址栏主动提交的那个地址，不能把加载期间的任意外域跳转都当成用户操作。 */
export function isRequestedBrowserNavigation(
  requestedUrl: string,
  targetUrl: string,
): boolean {
  if (!requestedUrl) return false;
  try {
    const requested = new URL(requestedUrl);
    const target = new URL(targetUrl);
    requested.hash = '';
    target.hash = '';
    return requested.href === target.href;
  } catch {
    return false;
  }
}
