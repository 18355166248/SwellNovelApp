/* eslint-env node, es2021 */
// 真实网络抽查：只输出目录/字数/耗时，不保存或打印小说正文，也不写入用户书架。
// Node 的 curl 传输不能替代 iOS WebView；需要浏览器执行脚本的回退会明确标为未验证。
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};
global.__DEV__ = false;
const args = process.argv.slice(2);
const outputArg = args.find(value => value.startsWith('--output='));
const searchArg = args.find(value => value.startsWith('--search='));
const dohArg = args.find(value => value.startsWith('--doh-url='));
const dohUrl = dohArg?.slice(10);
if (dohUrl && new URL(dohUrl).protocol !== 'https:')
  throw new Error('DoH 必须使用 HTTPS');
const output = path.resolve(outputArg?.slice(9) || '/tmp/novel-source-qa.json');
const urls = args.filter(value => /^https?:\/\//.test(value));
if (!urls.length && !searchArg) {
  console.error(
    'Usage: node scripts/verify-sources.cjs [--output=FILE] [--search=KEYWORD] [--doh-url=HTTPS_URL] URL...',
  );
  process.exit(1);
}
const requests = [];
let activeSignal;

// 保留 App 自己的代理选择、重试、解码和解析逻辑，只将底层传输换成可复核的 curl。
global.fetch = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const signal = AbortSignal.any(
      [options.signal, activeSignal].filter(Boolean),
    );
    const headers = Object.entries(options.headers || {}).flatMap(
      ([key, value]) => ['-H', `${key}: ${value}`],
    );
    execFile(
      'curl',
      [
        '-sS',
        '-L',
        '--max-redirs',
        '3',
        '--max-time',
        '15',
        // 诊断网络 DNS 差异时可仅为本次 curl 使用 DoH，不改系统设置、不固定站点 IP。
        ...(dohUrl ? ['--doh-url', dohUrl] : []),
        ...headers,
        '-w',
        '\n%{http_code}',
        String(url),
      ],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, signal },
      (error, stdout) => {
        const split = stdout?.lastIndexOf(10) ?? -1;
        const status =
          split >= 0 ? Number(stdout.subarray(split + 1).toString()) : 0;
        requests.push({
          url: String(url).replace(/[?&]__nvl_proxy_ts=\d+/, ''),
          status,
          ms: Date.now() - started,
          error: error?.message,
        });
        if (error) reject(error);
        else if (status < 100) reject(new Error('未取得 HTTP 响应'));
        else resolve(new Response(stdout.subarray(0, split), { status }));
      },
    );
  });

const { resolveSource } = require('../src/services/source/registry.ts');
const bridge = require('../src/services/browserFetch/bridge.ts');
const { searchNovels } = require('../src/services/search/novelSearchCore.ts');
const {
  isInvalidOnlineChapterContent,
} = require('../src/services/source/contentQuality.ts');
const {
  catalogNumberSummary,
} = require('../src/utils/catalogNumberSummary.ts');
bridge.registerBrowserFetcher(job =>
  job.reject(new Error('此回退需要原生 WebView，请在 iOS 验证')),
);

async function run() {
  const results = [];
  const report = {
    checkedAt: new Date().toISOString(),
    transport: 'App fetchHtml with curl transport; native WebView unavailable',
    ...(dohUrl ? { dohUrl } : {}),
    results,
  };
  const saveReport = () =>
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
  if (searchArg) {
    const started = Date.now();
    const controller = new AbortController();
    activeSignal = controller.signal;
    report.search = { keyword: searchArg.slice(9), updates: [] };
    try {
      report.search.results = await searchNovels(report.search.keyword, {
        onResults: items =>
          report.search.updates.push({ ms: Date.now() - started, items }),
      });
    } catch (error) {
      report.search.error = error.message;
    }
    controller.abort();
    report.search.ms = Date.now() - started;
    report.search.requests = [...requests];
    saveReport();
    console.log(JSON.stringify(report.search));
  }
  for (const url of urls) {
    const source = resolveSource(url);
    const started = Date.now();
    const requestStart = requests.length;
    const controller = new AbortController();
    activeSignal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 60000);
    const result = { url, source: source?.id, status: 'failed', samples: [] };
    try {
      if (!source) throw new Error('未注册书源');
      const info = await source.parseBookInfo(url);
      result.title = info.title;
      result.author = info.author;
      const chapters = await source.parseCatalog(info, {
        signal: activeSignal,
      });
      const identities = chapters.map(chapter => new URL(chapter.url).pathname);
      if (new Set(identities).size !== identities.length)
        throw new Error('目录含重复章节地址');
      result.catalog = {
        count: chapters.length,
        first: chapters[0],
        last: chapters.at(-1),
        numbers: catalogNumberSummary(chapters),
      };
      for (const index of new Set([
        0,
        Math.floor(chapters.length / 2),
        chapters.length - 1,
      ])) {
        const chapter = chapters[index];
        const sample = {
          index,
          title: chapter.title,
          url: chapter.url,
          status: 'failed',
        };
        try {
          const parsed = await source.parseChapterContent(chapter.url, {
            signal: activeSignal,
          });
          const content = typeof parsed === 'string' ? parsed : parsed.content;
          if (
            typeof parsed !== 'string' &&
            (parsed.complete === false || parsed.nextPageUrl)
          )
            throw new Error('仍有未加载续页，不能判定正文完整');
          if (
            isInvalidOnlineChapterContent(content, {
              trustedShort:
                typeof parsed === 'string' ? false : parsed.trustedShort,
            })
          )
            throw new Error('正文质量校验失败');
          sample.chars = content.length;
          sample.complete =
            typeof parsed === 'string' ? undefined : parsed.complete;
          sample.pages =
            typeof parsed === 'string'
              ? undefined
              : parsed.loadedPageUrls?.length;
          sample.status = 'passed';
          sample.parsedTitle =
            typeof parsed === 'string' ? undefined : parsed.title;
        } catch (error) {
          sample.error = error.message;
        }
        result.samples.push(sample);
      }
      result.status = result.samples.every(sample => sample.status === 'passed')
        ? 'passed'
        : 'catalog-only';
    } catch (error) {
      result.error = error.message;
    } finally {
      clearTimeout(timer);
      result.ms = Date.now() - started;
      result.requests = requests.slice(requestStart);
      results.push(result);
      saveReport();
      console.log(
        JSON.stringify({
          source: result.source,
          title: result.title,
          status: result.status,
          count: result.catalog?.count,
          ms: result.ms,
          samples: result.samples.map(sample => ({
            status: sample.status,
            chars: sample.chars,
            pages: sample.pages,
            error: sample.error,
          })),
          error: result.error,
        }),
      );
    }
  }
  console.log(`Report: ${output}`);
  if (
    report.search?.error ||
    results.some(result => result.status !== 'passed')
  )
    process.exitCode = 2;
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
