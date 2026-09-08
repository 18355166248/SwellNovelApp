/* eslint-env node, browser */
// Run against `npm run web`: NODE_PATH=<playwright installation> node scripts/verify-reader-web.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const baseURL = process.env.READER_QA_URL || 'http://localhost:8093';
const outputDir = path.resolve('artifacts/reader-qa');
const bookId = 'reader-qa-book';
const chapters = Array.from({ length: 3 }, (_, index) => ({
  id: `reader-qa-chapter-${index}`,
  bookId,
  title: `第${index + 1}章 翻页回归`,
  order: index,
  content: Array.from(
    { length: 36 },
    (_, paragraph) =>
      `【${index + 1}章${paragraph + 1}段】` +
      '清晨的风穿过树梢，读者沿着书中的文字继续前行。我们检查每一页的开头和结尾，确认文字连续，翻页方向与阅读位置一致。'.repeat(
        3,
      ) +
      '测试 mixed English words 2026，以及生僻字𠮷和表情😀。',
  ).join('\n'),
}));
const fixture = {
  version: 1,
  readerSettingsVersion: 2,
  books: [
    {
      id: bookId,
      title: '翻页回归测试',
      author: '本地测试',
      addedAt: 1,
      updatedAt: 1,
      progress: 0,
      totalChapters: 3,
    },
  ],
  chapters: { [bookId]: chapters },
  readingHistory: {},
  bookmarks: {
    [bookId]: [
      {
        id: 'bookmark-first-page',
        bookId,
        chapterId: chapters[0].id,
        position: 0,
        createdAt: 1,
      },
    ],
  },
  readerSettings: {
    theme: 'paper',
    fontSizeIndex: 4,
    lineHeightIndex: 1,
    pageMode: 'page',
  },
};

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.READER_QA_BROWSER || 'chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    const client = await context.newCDPSession(page);
    const swipe = async (from, to) => {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: from, y: 400 }],
      });
      for (let step = 1; step <= 6; step++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from + ((to - from) * step) / 6, y: 400 }],
        });
        await page.waitForTimeout(20);
      }
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    };
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error(error.message);
    });
    await page.addInitScript(snapshot => {
      if (!sessionStorage.getItem('reader-qa-seeded')) {
        localStorage.setItem(
          'swell-novel-library-state-v1',
          JSON.stringify(snapshot),
        );
        sessionStorage.setItem('reader-qa-seeded', 'true');
      }
    }, fixture);
    await page.goto(baseURL);
    await page.getByText('读至 0%', { exact: true }).click();
    await page.getByText('开始阅读', { exact: true }).click();
    const state = () =>
      page.evaluate(() => {
        const label = document.body.innerText.match(/本章 (\d+) \/ (\d+) 页/);
        const root = document.querySelector('[data-testid="reader-page-list"]');
        const node =
          root &&
          [root, ...root.querySelectorAll('*')].find(
            item =>
              item.clientWidth > 0 &&
              item.scrollWidth > item.clientWidth &&
              ['auto', 'scroll'].includes(getComputedStyle(item).overflowX),
          );
        return {
          index: label ? Number(label[1]) - 1 : -1,
          total: label ? Number(label[2]) : 0,
          x: node?.scrollLeft ?? 0,
          width: node?.clientWidth ?? 390,
          preparing: !!document.querySelector(
            '[data-testid="reader-page-preparing"]',
          ),
        };
      });
    const settle = async expected => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = await state();
        if (
          !value.preparing &&
          (expected == null || value.index === expected) &&
          Math.abs(value.x - value.index * value.width) < 1
        )
          return value;
        await page.waitForTimeout(30);
      }
      await page.screenshot({ path: path.join(outputDir, 'failure.png') });
      throw new Error(
        `Page did not settle at ${expected}: ${JSON.stringify(await state())}`,
      );
    };
    await settle(0);
    await page.screenshot({ path: path.join(outputDir, 'first-page.png') });
    const firstPage = await state();
    const textAt = async index =>
      page
        .getByTestId(`reader-page-${index}`)
        .getByTestId('reader-page-text')
        .allTextContents();
    const seen = [...(await textAt(0))];
    const overflow = [];
    for (let index = 1; index < firstPage.total; index++) {
      await page.keyboard.press('ArrowRight');
      if (index === 1) {
        const samples = [];
        for (let step = 0; step < 10; step++) {
          samples.push((await state()).x);
          await page.waitForTimeout(20);
        }
        assert(
          samples.some(x => x > 0 && x < firstPage.width),
          `No intermediate animation frames: ${samples}`,
        );
      }
      await settle(index);
      seen.push(...(await textAt(index)));
      const excess = await page
        .getByTestId(`reader-page-${index}`)
        .evaluate(root => {
          const bottom = root.getBoundingClientRect().bottom;
          return [...root.querySelectorAll('[data-testid="reader-page-text"]')]
            .filter(node => node.getBoundingClientRect().bottom > bottom + 1)
            .map(node => ({
              bottom: node.getBoundingClientRect().bottom,
              expected: bottom,
            }));
        });
      if (excess.length) overflow.push({ index, excess });
    }
    assert.equal(
      seen.join('').replace(/　/g, ''),
      chapters[0].content.replace(/\n/g, ''),
    );
    assert.deepEqual(overflow, [], 'Body text overflowed the page');
    const lastPageText = await textAt(firstPage.total - 1);
    console.log(
      `PASS all ${firstPage.total} pages: exact text reconstruction, no overflow, smooth movement`,
    );
    await swipe(300, 90);
    await settle(0);
    assert((await textAt(0)).join('').includes('【2章1段】'));
    await swipe(90, 300);
    await settle(firstPage.total - 1);
    assert.deepEqual(await textAt(firstPage.total - 1), lastPageText);
    console.log(
      'PASS touch chapter boundaries: next first page, previous last page',
    );
    await page.evaluate(() => {
      for (let index = 0; index < 3; index++)
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
        );
    });
    await settle(firstPage.total - 4);
    await page.waitForTimeout(350);
    await settle(firstPage.total - 4);
    console.log(
      'PASS three turns in the same event batch; no late-frame rollback',
    );
    await page.mouse.click(195, 400);
    await page.getByRole('button', { name: '目录', exact: true }).click();
    const search = page.getByPlaceholder('搜索章节', { exact: true });
    await search.fill('a');
    await search.press('Space');
    await search.press('ArrowLeft');
    assert.equal(await search.inputValue(), 'a ');
    assert.equal((await state()).index, firstPage.total - 4);
    await page.getByText('书签', { exact: true }).last().click();
    await page.getByLabel(/跳转到.*的书签/).click();
    await settle(0);
    console.log(
      'PASS input keyboard isolation and jump back to first-page bookmark',
    );
    await page.evaluate(() => {
      for (let index = 0; index < 5; index++)
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        );
    });
    await settle(5);
    await page.getByTestId('reader-page-5').focus();
    await page.keyboard.press('Space');
    await settle(6);
    await page.keyboard.press('Shift+Space');
    await settle(5);
    console.log('PASS focused page space shortcuts: exactly one turn per key');
    await page.mouse.click(195, 400);
    await page.getByText('设置', { exact: true }).click();
    await page.getByLabel('增大字号', { exact: true }).click();
    await page
      .getByLabel('关闭阅读设置', { exact: true })
      .click({ position: { x: 10, y: 50 } });
    await page.getByLabel('关闭阅读设置', { exact: true }).waitFor({ state: 'hidden' });
    const resized = await settle();
    assert(resized.index > 0);
    await page.setViewportSize({ width: 844, height: 390 });
    assert((await settle()).index > 0);
    await page.screenshot({ path: path.join(outputDir, 'landscape.png') });
    console.log(
      'PASS font resize and landscape reflow: rendered landing, no stuck loading',
    );
    fs.writeFileSync(
      path.join(outputDir, 'result.json'),
      JSON.stringify(
        { pagesChecked: firstPage.total, overflow, errors },
        null,
        2,
      ),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
