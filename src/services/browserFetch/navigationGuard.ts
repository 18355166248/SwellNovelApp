/**
 * 浏览器识别源的广告跳转防护。
 * 小说站常通过顶层跳转把目录页带到无关广告域名；目录和章节均在原站内，
 * 因此抓取 WebView 只允许同主域名导航，避免把广告空页误判为“目录无章节”。
 */
function hostOf(url: string): string {
  return /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1].toLowerCase() || '';
}

export function isSameSiteNavigation(
  fromUrl: string,
  targetUrl: string,
): boolean {
  const from = hostOf(fromUrl);
  const target = hostOf(targetUrl);
  if (!from || !target) return true;
  return (
    target === from ||
    target.endsWith(`.${from}`) ||
    from.endsWith(`.${target}`)
  );
}

/** 已适配的第三方书源启用跨站跳转拦截，广告不能把目录带离当前小说站。 */
export function shouldBlockAdNavigation(
  fromUrl: string,
  targetUrl: string,
): boolean {
  return (
    /(^|\.)(?:xuanhuange\.info|bqquge\.org)(?::\d+)?$/i.test(hostOf(fromUrl)) &&
    !isSameSiteNavigation(fromUrl, targetUrl)
  );
}
