export interface ReaderLevel {
  level: number;
  title: string;
  thresholdMinutes: number;
}

export const READER_LEVELS: ReaderLevel[] = [
  { level: 1, title: '初见书页', thresholdMinutes: 0 },
  { level: 2, title: '青灯读者', thresholdMinutes: 60 },
  { level: 3, title: '墨香读者', thresholdMinutes: 180 },
  { level: 4, title: '书海行者', thresholdMinutes: 360 },
  { level: 5, title: '卷中知己', thresholdMinutes: 720 },
  { level: 6, title: '翰墨雅士', thresholdMinutes: 1200 },
  { level: 7, title: '藏书达人', thresholdMinutes: 1800 },
  { level: 8, title: '博览君子', thresholdMinutes: 3000 },
  { level: 9, title: '万卷先生', thresholdMinutes: 4500 },
  { level: 10, title: '书境宗师', thresholdMinutes: 6000 },
  { level: 11, title: '青灯常伴', thresholdMinutes: 8400 },
  { level: 12, title: '墨海拾光', thresholdMinutes: 11400 },
  { level: 13, title: '典籍寻幽', thresholdMinutes: 15000 },
  { level: 14, title: '文心知远', thresholdMinutes: 19200 },
  { level: 15, title: '书山问道', thresholdMinutes: 24000 },
  { level: 16, title: '千卷藏心', thresholdMinutes: 30000 },
  { level: 17, title: '万卷通今', thresholdMinutes: 36600 },
  { level: 18, title: '翰墨长明', thresholdMinutes: 43800 },
  { level: 19, title: '书海无涯', thresholdMinutes: 51600 },
  { level: 20, title: '阅尽千帆', thresholdMinutes: 60000 },
];

export const DAILY_READER_GROWTH_LIMIT = 120;

/** 从既有每日秒数重算阅历，不改写真实统计；每日封顶让长期阅读比单日挂机更有价值。 */
export function readerGrowthMinutes(
  secondsByDate: Record<string, number>,
): number {
  const seconds = Object.values(secondsByDate).reduce(
    (sum, value) =>
      sum +
      (Number.isFinite(value) && value > 0
        ? Math.min(value, DAILY_READER_GROWTH_LIMIT * 60)
        : 0),
    0,
  );
  return Math.floor(seconds / 60);
}

export interface ReaderLevelProgress {
  current: ReaderLevel;
  next: ReaderLevel | null;
  progress: number;
  remainingMinutes: number;
}

/** 输入已封顶的成长分钟；旧等级未独立存储，升级后按相同历史记录自然重算。 */
export function resolveReaderLevel(totalMinutes: number): ReaderLevelProgress {
  const normalized = Number.isFinite(totalMinutes)
    ? Math.max(0, Math.floor(totalMinutes))
    : 0;
  let current = READER_LEVELS[0];
  for (const level of READER_LEVELS) {
    if (normalized < level.thresholdMinutes) break;
    current = level;
  }
  const next =
    READER_LEVELS.find(level => level.level === current.level + 1) ?? null;
  if (!next) {
    return { current, next: null, progress: 1, remainingMinutes: 0 };
  }
  const span = next.thresholdMinutes - current.thresholdMinutes;
  return {
    current,
    next,
    progress: Math.min(1, (normalized - current.thresholdMinutes) / span),
    remainingMinutes: Math.max(0, next.thresholdMinutes - normalized),
  };
}
