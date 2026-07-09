import type { Chapter } from '../store/types/book';

const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const CN_UNITS: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
};

export function parseChineseInteger(raw: string): number | undefined {
  const input = raw.replace(/\s+/g, '');
  if (!input) return undefined;
  if (/^\d+$/.test(input)) return Number(input);
  if (!/^[零一二两三四五六七八九十百千万]+$/.test(input)) return undefined;

  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of input) {
    if (ch in CN_DIGITS) {
      number = CN_DIGITS[ch];
      continue;
    }
    const unit = CN_UNITS[ch];
    if (!unit) return undefined;
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      // “十/百/千”前省略“一”时按 1 处理，例如“十章”“百章”。
      section += (number || 1) * unit;
    }
    number = 0;
  }
  return total + section + number;
}

export function extractChapterNumberFromTitle(title: string): number | undefined {
  const match = /第\s*([0-9]+|[零一二两三四五六七八九十百千万]+)\s*[章节回卷]/.exec(
    title,
  );
  return match ? parseChineseInteger(match[1]) : undefined;
}

function isPlainArabicChapterTitle(title: string): boolean {
  return /^第\s*\d+\s*[章节回卷]\s*$/.test(title.replace(/\s+/g, ''));
}

function parseQueryNumber(query: string): number | undefined {
  const normalized = query
    .trim()
    .replace(/^第\s*/, '')
    .replace(/\s*[章节回卷]\s*$/g, '');
  return parseChineseInteger(normalized);
}

function extractSourceUrlOrder(sourceUrl?: string): number | undefined {
  const match = /\/read\/\d+_(\d+)(?:_\d+)?\.html(?:[?#].*)?$/i.exec(
    sourceUrl || '',
  );
  return match ? Number(match[1]) : undefined;
}

export function resolveChapterSearchIndex(
  chapters: Pick<Chapter, 'title' | 'sourceUrl'>[],
  query: string,
  fallbackIndex: number,
): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return fallbackIndex;

  const queryNumber = parseQueryNumber(normalizedQuery);
  if (queryNumber != null && Number.isInteger(queryNumber) && queryNumber >= 1) {
    // 在线书目录的数组位置、正文 URL 序号、真实章号可能不同；搜索数字时
    // 优先匹配标题里的真实“第N章”，否则会把“450”滚到第 450 个目录项。
    const trustedTitleNumberIndex = chapters.findIndex(
      chapter =>
        !isPlainArabicChapterTitle(chapter.title) &&
        extractChapterNumberFromTitle(chapter.title) === queryNumber,
    );
    if (trustedTitleNumberIndex >= 0) return trustedTitleNumberIndex;

    const sourceOrderIndex = chapters.findIndex(
      chapter => extractSourceUrlOrder(chapter.sourceUrl) === queryNumber,
    );
    if (sourceOrderIndex >= 0) return sourceOrderIndex;

    const titleNumberIndex = chapters.findIndex(
      chapter => extractChapterNumberFromTitle(chapter.title) === queryNumber,
    );
    if (titleNumberIndex >= 0) return titleNumberIndex;

    if (queryNumber <= chapters.length) return queryNumber - 1;
  }

  const titleIndex = chapters.findIndex(chapter =>
    chapter.title.toLowerCase().includes(normalizedQuery),
  );
  return titleIndex >= 0 ? titleIndex : fallbackIndex;
}
