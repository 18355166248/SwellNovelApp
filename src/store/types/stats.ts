/**
 * 阅读统计类型。
 *
 * 只记录「每天累计阅读秒数」这一份原始数据，连续天数、累计时长、今日已读等
 * 指标都由它派生，避免维护多份易失同步的冗余字段。日期用本地时区的
 * 'YYYY-MM-DD' 作键。
 */
export interface ReadingStats {
  secondsByDate: Record<string, number>;
}

export const emptyReadingStats: ReadingStats = { secondsByDate: {} };

/** 本地时区的 YYYY-MM-DD。 */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ReadingStatsSummary {
  todayMinutes: number; // 今日阅读分钟
  totalMinutes: number; // 累计阅读分钟
  activeDays: number; // 有阅读记录的天数
  streak: number; // 截至今天（或昨天）的连续阅读天数
}

/** 从原始 secondsByDate 派生汇总指标。 */
export function summarizeReadingStats(stats: ReadingStats): ReadingStatsSummary {
  const byDate = stats.secondsByDate;
  const keys = Object.keys(byDate).filter(k => byDate[k] > 0);
  const totalSeconds = keys.reduce((sum, k) => sum + byDate[k], 0);
  const today = dateKey();

  // 连续天数：从今天往前逐日回溯；今天还没读时允许从昨天起算，不打断已有连续。
  const has = (d: Date) => (byDate[dateKey(d)] ?? 0) > 0;
  const cursor = new Date();
  if (!has(cursor)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (has(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    todayMinutes: Math.round((byDate[today] ?? 0) / 60),
    totalMinutes: Math.round(totalSeconds / 60),
    activeDays: keys.length,
    streak,
  };
}
