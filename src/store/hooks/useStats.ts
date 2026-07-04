/**
 * 阅读统计 hooks：累加阅读时长、读取派生汇总。
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { readingStatsAtom } from '../atoms';
import {
  dateKey,
  summarizeReadingStats,
  ReadingStatsSummary,
} from '../types/stats';

/**
 * 累加阅读时长（毫秒）到今天。返回的函数引用稳定，可安全放进阅读器计时器。
 */
export const useAddReadingTime = () => {
  const setStats = useSetAtom(readingStatsAtom);
  return (ms: number) => {
    if (!(ms > 0)) return;
    const seconds = Math.round(ms / 1000);
    if (seconds <= 0) return;
    const key = dateKey();
    setStats(prev => ({
      secondsByDate: {
        ...prev.secondsByDate,
        [key]: (prev.secondsByDate[key] ?? 0) + seconds,
      },
    }));
  };
};

/** 派生的阅读统计汇总（今日/累计分钟、活跃天数、连续天数）。 */
export const useReadingStats = (): ReadingStatsSummary => {
  const stats = useAtomValue(readingStatsAtom);
  return summarizeReadingStats(stats);
};
