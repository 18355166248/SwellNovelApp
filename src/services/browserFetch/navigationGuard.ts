/**
 * 浏览器识别源的广告跳转防护。
 * 小说站常通过顶层跳转把目录页带到无关广告域名；目录和章节均在原站内，
 * 因此抓取 WebView 只允许同主域名导航，避免把广告空页误判为“目录无章节”。
 */
function hostOf(url: string): string {
  return /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1].toLowerCase() || '';
}

export function isSameSiteNavigation(fromUrl: string, targetUrl: string): boolean {
  const from = hostOf(fromUrl);
  const target = hostOf(targetUrl);
  if (!from || !target) return true;
  return target === from || target.endsWith(`.${from}`) || from.endsWith(`.${target}`);
}

/** 仅对用户确认的玄幻阁站点启用顶层跨站拦截，保留通用浏览器的正常外链能力。 */
export function shouldBlockAdNavigation(fromUrl: string, targetUrl: string): boolean {
  return /(^|\.)xuanhuange\.info(?::\d+)?$/i.test(hostOf(fromUrl)) &&
    !isSameSiteNavigation(fromUrl, targetUrl);
}
