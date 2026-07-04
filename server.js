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

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.resolve(__dirname, 'dist');

// ── Gzip / Brotli 压缩 ─────────────────────────────────────
app.use(compression());

// ── 书源代理 ────────────────────────────────────────────────
// Cloudflare 通过 JA3/TLS 指纹拦截 Node.js http 模块的请求（即使 header
// 完全伪装成手机端也返回 403 challenge）。curl 的 TLS 指纹被放行，因此用
// 子进程调用 curl 来转发上游请求。
const PROXY_PREFIX = '/proxy/bookshuku';
const UPSTREAM = 'http://wap.bookshuku.org';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 ' +
  'Mobile/15E148 Safari/604.1';

app.use(PROXY_PREFIX, (req, res) => {
  // Express app.use(path, fn) 已剥掉 PROXY_PREFIX，req.url 即上游路径
  const target = UPSTREAM + (req.url || '/');

  execFile(
    'curl',
    [
      '-s', '-L', '--max-redirs', '3',
      '--connect-timeout', '10',
      '--max-time', '15',
      '-H', `User-Agent: ${MOBILE_UA}`,
      '-H', 'Accept: text/html',
      target,
    ],
    { timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout) => {
      if (err) {
        console.error('[bookshuku-proxy]', err.message);
        res.status(502).type('text/plain').send('Proxy upstream error');
        return;
      }
      res.type('text/html; charset=utf-8')
        .set('cache-control', 'no-store')
        .send(stdout);
    },
  );
});

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
