/**
 * 服务端 curl 代理地址（书源抓取专用）。
 *
 * 书源站点用 TLS/JA3 指纹识别客户端：只有服务端 curl 代理能拿到完整单页目录，
 * iOS 原生 fetch/WebView 会被降级成 JS 分页目录（每页约 10 章、标题为“分节阅读 N”
 * 占位）。因此真机也必须经服务端 curl 代理。开发走本机 server.js，生产/真机走公网
 * 部署的同一份 server.js。
 *
 * 迁移服务器时只改这里一处（IP/域名/端口），避免地址散落到各处硬编码。
 */

/** 开发期本机代理（server.js 默认监听 :3000）。 */
export const DEV_PROXY_ORIGIN = 'http://127.0.0.1:3000';

/** 生产 / 真机公网代理。换服务器时改这里。 */
export const PROD_PROXY_ORIGIN = 'http://101.43.11.224:11008';

/** 当前运行环境应使用的代理源：开发用本机，生产/真机用公网。 */
export function getProxyOrigin(): string {
  return typeof __DEV__ !== 'undefined' && __DEV__
    ? DEV_PROXY_ORIGIN
    : PROD_PROXY_ORIGIN;
}
