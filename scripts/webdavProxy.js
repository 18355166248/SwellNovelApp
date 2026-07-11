const https = require('https');

const allowedHosts = () =>
  (process.env.WEBDAV_ALLOWED_HOSTS || 'dav.jianguoyun.com')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);

const readJson = req =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });

const send = (res, status, body) => {
  if (typeof res.status === 'function') {
    res.status(status).type('text/plain').send(body);
    return;
  }
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain');
  res.end(body);
};

const webDavProxy = async (req, res) => {
  let payload;
  try {
    payload = await readJson(req);
    const target = new URL(payload.url);
    if (target.protocol !== 'https:' || !allowedHosts().includes(target.hostname.toLowerCase())) {
      send(res, 403, 'WebDAV host not allowed');
      return;
    }
    const body = payload.body ? Buffer.from(payload.body, 'base64') : undefined;
    const upstream = https.request(target, {
      method: payload.method,
      headers: payload.headers,
      timeout: 30000,
    }, upstreamRes => {
      if (typeof res.status === 'function') res.status(upstreamRes.statusCode || 502);
      else res.statusCode = upstreamRes.statusCode || 502;
      ['content-type', 'content-length', 'last-modified'].forEach(header => {
        if (upstreamRes.headers[header]) res.set(header, upstreamRes.headers[header]);
      });
      upstreamRes.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('WebDAV timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, 'WebDAV upstream error');
    });
    upstream.end(body);
  } catch {
    if (!res.headersSent) send(res, 400, 'Invalid WebDAV request');
  }
};

module.exports = { webDavProxy };
