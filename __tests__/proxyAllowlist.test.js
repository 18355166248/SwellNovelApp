const { readFileSync } = require('fs');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..');

function readAllowedHosts(relativePath) {
  const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
  const block = /const ALLOWED_HOSTS = \[([\s\S]*?)\];/.exec(source)?.[1];
  if (!block) throw new Error(`${relativePath} 未定义 ALLOWED_HOSTS`);
  return Array.from(block.matchAll(/\/([^/\n]+)\/i/g), match => match[1]).sort();
}

describe('source proxy allowlists', () => {
  it('keeps development and deploy servers aligned with the root server', () => {
    const rootAllowlist = readAllowedHosts('server.js');

    expect(readAllowedHosts('webpack.config.js')).toEqual(rootAllowlist);
    expect(readAllowedHosts('deploy/server.js')).toEqual(rootAllowlist);
    expect(rootAllowlist).toEqual(
      expect.arrayContaining([
        '(^|\\.)xuanhuange\\.info$',
        '^html\\.duckduckgo\\.com$',
        '^www\\.bing\\.com$',
      ]),
    );
  });
});
