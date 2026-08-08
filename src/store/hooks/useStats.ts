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
      ...prev,
      secondsByDate: {
        ...prev.secondsByDate,
        [key]: (prev.secondsByDate[key] ?? 0) + seconds,
      },
    }));
  };
};

/** 设置每日阅读目标；离散档位由界面控制，这里只做有效范围兜底。 */
export const useSetDailyReadingGoal = () => {
  const setStats = useSetAtom(readingStatsAtom);
  return (minutes: number) => {
    const normalized = Math.max(5, Math.min(180, Math.round(minutes)));
    setStats(prev => ({ ...prev, dailyGoalMinutes: normalized }));
  };
};

/** 派生的阅读统计汇总（今日/累计分钟、活跃天数、连续天数）。 */
export const useReadingStats = (): ReadingStatsSummary => {
  const stats = useAtomValue(readingStatsAtom);
  return summarizeReadingStats(stats);
};
