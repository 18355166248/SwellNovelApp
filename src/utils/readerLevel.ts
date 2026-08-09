export interface ReaderLevel {
  level: number;
  title: string;
  thresholdMinutes: number;
}

export const READER_LEVELS: ReaderLevel[] = [
  { level: 1, title: '初见书页', thresholdMinutes: 0 },
  { level: 2, title: '青灯读者', thresholdMinutes: 30 },
  { level: 3, title: '墨香读者', thresholdMinutes: 90 },
  { level: 4, title: '书海行者', thresholdMinutes: 180 },
  { level: 5, title: '卷中知己', thresholdMinutes: 300 },
  { level: 6, title: '翰墨雅士', thresholdMinutes: 480 },
  { level: 7, title: '藏书达人', thresholdMinutes: 720 },
  { level: 8, title: '博览君子', thresholdMinutes: 1020 },
  { level: 9, title: '万卷先生', thresholdMinutes: 1380 },
  { level: 10, title: '书境宗师', thresholdMinutes: 1800 },
];

export interface ReaderLevelProgress {
  current: ReaderLevel;
  next: ReaderLevel | null;
  progress: number;
  remainingMinutes: number;
}

/** 阅历只依赖累计有效阅读分钟，避免翻页或重复打开书籍刷等级。 */
export function resolveReaderLevel(totalMinutes: number): ReaderLevelProgress {
  const normalized = Math.max(0, Math.floor(totalMinutes));
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
