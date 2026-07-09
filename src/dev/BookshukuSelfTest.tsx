import React from 'react';
import RNFS from 'react-native-fs';
import { bookshukuSource } from '../services/source/bookshuku';
import type { ParsedChapterContent } from '../services/source/types';

const REQUEST_PATH = `${RNFS.DocumentDirectoryPath}/bookshuku-selftest-request.json`;
const REPORT_PATH = `${RNFS.DocumentDirectoryPath}/bookshuku-selftest-report.json`;
const TEST_URL = 'http://wap.bookshuku.org/bookinfo/160297.html';
const STEP_TIMEOUT_MS = 60000;

function unpack(result: ParsedChapterContent) {
  return typeof result === 'string' ? { content: result } : result;
}

function blocked(content?: string): boolean {
  const normalized = (content || '').replace(/\s+/g, '');
  return !!(
    content &&
    (/请在浏览器中打开/.test(content) ||
      /当前环境无法直接下载/.test(content) ||
      /Just a moment/i.test(content) ||
      /Enable JavaScript and cookies/i.test(content) ||
      /外围名媛|福利姬|自慰|口交|成人视频|约爱社区/.test(normalized) ||
      /👁️/.test(content) ||
      normalized.length < 200)
  );
}

async function step<T>(
  name: string,
  task: () => Promise<T>,
): Promise<{ name: string; ok: true; ms: number; value: T } | { name: string; ok: false; ms: number; error: string }> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`step timeout ${STEP_TIMEOUT_MS}ms`)),
          STEP_TIMEOUT_MS,
        );
      }),
    ]);
    return { name, ok: true, ms: Date.now() - startedAt, value };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 开发自测入口：只有 Documents 下存在触发文件时才运行，避免影响正常用户。
 * 运行在 App 内部是必要的，因为 bookshuku 正文依赖常驻 WebView 过 Cloudflare/JS。
 */
export function BookshukuSelfTest() {
  React.useEffect(() => {
    if (!__DEV__) return;
    let cancelled = false;
    const run = async () => {
      if (!(await RNFS.exists(REQUEST_PATH))) return;
      await RNFS.unlink(REQUEST_PATH).catch(() => {});
      const report: any = {
        url: TEST_URL,
        startedAt: new Date().toISOString(),
        steps: [],
      };
      const push = async (entry: any) => {
        report.steps.push(entry);
        report.updatedAt = new Date().toISOString();
        await RNFS.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
      };

      // 等 WebViewFetcher 的 registerBrowserFetcher effect 完成注册。
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (cancelled) return;

      let info: Awaited<ReturnType<typeof bookshukuSource.parseBookInfo>> | undefined;
      const infoStep = await step('parseBookInfo', () =>
        bookshukuSource.parseBookInfo(TEST_URL),
      );
      await push(infoStep);
      if (infoStep.ok) info = infoStep.value;
      if (!info || cancelled) return;

      let catalog: Awaited<ReturnType<typeof bookshukuSource.parseCatalog>> = [];
      const catalogStep = await step('parseCatalog', async () => {
        const chapters = await bookshukuSource.parseCatalog(info!);
        catalog = chapters;
        return {
          count: chapters.length,
          first: chapters[0],
          chapter11: chapters[10],
          chapter492: chapters[491],
          chapter493: chapters[492],
          chapter496: chapters[495],
          chapter754: chapters[753],
        };
      });
      await push(catalogStep);
      if (!catalog.length) {
        catalog = Array.from({ length: 754 }, (_, index) => ({
          url: `http://wap.bookshuku.org/read/160297_${index + 1}.html`,
          title: `第${index + 1}章`,
        }));
        await push({
          name: 'parseCatalog:fallbackKnownUrls',
          ok: true,
          value: {
            count: catalog.length,
            chapter491: catalog[490],
            chapter492: catalog[491],
            chapter493: catalog[492],
          },
        });
      }
      if (cancelled) return;

      for (const order of [1, 496]) {
        await push({
          name: `parseChapter:${order}`,
          ok: 'running',
          startedAt: new Date().toISOString(),
        });
        const entry = await step(`parseChapter:${order}`, async () => {
          const chapter = catalog[order - 1];
          const parsed = unpack(await bookshukuSource.parseChapterContent(chapter.url));
          return {
            order,
            catalogTitle: chapter.title,
            url: chapter.url,
            title: parsed.title,
            length: parsed.content.length,
            nextPageUrl: parsed.nextPageUrl,
            complete: parsed.complete,
            blocked: blocked(parsed.content),
            head: parsed.content.slice(0, 120),
          };
        });
        await push(entry);
      }

      const ch492 = report.steps.find(
        (entry: any) => entry.name === 'parseChapter:492' && entry.ok === true,
      )?.value;
      if (ch492?.nextPageUrl && !cancelled) {
        const nextPageStep = await step('parseChapter:492:nextPage', async () => {
          const parsed = unpack(
            await bookshukuSource.parseChapterContent(ch492.nextPageUrl),
          );
          return {
            url: ch492.nextPageUrl,
            title: parsed.title,
            length: parsed.content.length,
            nextPageUrl: parsed.nextPageUrl,
            complete: parsed.complete,
            blocked: blocked(parsed.content),
            head: parsed.content.slice(0, 120),
          };
        });
        await push(nextPageStep);
      }

      report.finishedAt = new Date().toISOString();
      await RNFS.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    };
    run().catch(error => {
      RNFS.writeFile(
        REPORT_PATH,
        JSON.stringify(
          {
            url: TEST_URL,
            finishedAt: new Date().toISOString(),
            fatal: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
        'utf8',
      ).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
