/**
 * 生产环境服务器
 *
 * 职责：
 *   1. 托管 webpack 构建产物（dist/）
 *   2. 用 curl 子进程代理书源请求，绕开 Cloudflare TLS 指纹拦截
 *
 * 启动：
 *   node server.js          # 默认 :3000
 *   PORT=8080 node server.js # 自定义端口
 */

const express = require('express');
const compression = require('compression');
const path = require('path');
const { execFile } = require('child_process');
const { webDavProxy } = require('./scripts/webdavProxy');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.resolve(__dirname, 'dist');

// ── Gzip / Brotli 压缩 ─────────────────────────────────────
// 书源代理返回给 React Native fetch 时不要压缩：RN 的 arrayBuffer 在部分 iOS
// 环境会把 gzip 二进制直接交给 JS，导致后续按 HTML 解码后解析不到目录。
app.use(
  compression({
    filter: (req, res) =>
      !(req.originalUrl || req.url || '').startsWith('/proxy') &&
      compression.filter(req, res),
  }),
);

// ── 书源代理 ────────────────────────────────────────────────
// 通用前缀 /proxy/<host>/<path>：浏览器直连书源被 CORS 拦截，前端改写到此转发。
// 只代理白名单内的书源域名，避免变成开放代理被滥用。新增书源在此加一条域名规则。
//
// Cloudflare 通过 JA3/TLS 指纹拦截 Node.js http 模块的请求（即使 header
// 完全伪装成手机端也返回 403 challenge）。curl 的 TLS 指纹被放行，因此用
// 子进程调用 curl 来转发上游请求。
const ALLOWED_HOSTS = [
  /(^|\.)bookshuku\.org$/i,
  /(^|\.)mingzw\.net$/i,
  // 搜索页只用固定引擎定位已登记书源，仍不是开放代理。
  /^html\.duckduckgo\.com$/i,
  /^www\.bing\.com$/i,
];
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 ' +
  'Mobile/15E148 Safari/604.1';

app.use('/proxy', (req, res) => {
  // Express app.use('/proxy', fn) 已剥掉前缀，req.url 形如 /<scheme>/<host>/<上游路径>
  const m = /^\/(https?)\/([^/]+)(\/.*)?$/.exec(req.url || '');
  const host = m && m[2].toLowerCase();
  if (!host || !ALLOWED_HOSTS.some(re => re.test(host))) {
    res
      .status(host ? 403 : 400)
      .type('text/plain')
      .send(host ? 'Host not allowed' : 'Bad proxy path');
    return;
  }
  const target = `${m[1]}://${host}${m[3] || '/'}`;

  execFile(
    'curl',
    [
      '-s',
      '-L',
      // 明智屋当前 www 域名的证书主机名不匹配；该代理只允许固定书源白名单，
      // 因此仅在服务端到已知书源的抓取链路放宽校验，客户端仍只访问本服务端。
      '-k',
      '--max-redirs',
      '3',
      '--connect-timeout',
      '10',
      '--max-time',
      '25',
      '-H',
      `User-Agent: ${MOBILE_UA}`,
      '-H',
      'Accept: text/html',
      '-H',
      'Accept-Encoding:',
      target,
    ],
    { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout) => {
      if (err) {
        console.error('[source-proxy]', err.message);
        res.status(502).type('text/plain').send('Proxy upstream error');
        return;
      }
      res
        .type('text/html; charset=utf-8')
        .set('cache-control', 'no-store')
        .send(stdout);
    },
  );
});

// WebDAV 同源代理：浏览器无法直接访问未开放 CORS 的服务。仅允许 HTTPS 及
// WEBDAV_ALLOWED_HOSTS（默认坚果云），认证头只转发给指定上游，不写入日志。
app.post('/api/webdav', webDavProxy);

// ── 静态资源 ────────────────────────────────────────────────
app.use(express.static(DIST, { maxAge: '1y', immutable: true }));

// ── SPA fallback ────────────────────────────────────────────
// 所有未匹配的路由回退到 index.html，由前端 React Router 接管
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SwellNovel server running at http://localhost:${PORT}`);
});
