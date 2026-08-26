import {
  buildReadingInsights,
  formatMinutes,
} from '../src/utils/readingInsights';
import type { ReadingStats } from '../src/store/types/stats';

/** 用 'YYYY-MM-DD': 分钟 构造原始统计。 */
const statsOf = (
  minutesByDate: Record<string, number>,
  dailyGoalMinutes = 30,
): ReadingStats => ({
  secondsByDate: Object.fromEntries(
    Object.entries(minutesByDate).map(([date, minutes]) => [date, minutes * 60]),
  ),
  dailyGoalMinutes,
});

// 固定“今天”，让所有依赖当前日期的推导可重复。
const NOW = new Date('2026-08-25T10:00:00');

describe('buildReadingInsights', () => {
  it('汇总累计时长、活跃天数与日均', () => {
    const insights = buildReadingInsights(
      statsOf({ '2026-08-23': 30, '2026-08-24': 60, '2026-08-25': 30 }),
      NOW,
    );
    expect(insights.totalMinutes).toBe(120);
    expect(insights.activeDays).toBe(3);
    expect(insights.averageMinutesPerActiveDay).toBe(40);
    expect(insights.bestDay).toEqual({ date: '2026-08-24', minutes: 60 });
    expect(insights.firstDate).toBe('2026-08-23');
  });

  it('当前连续在今天未读时从昨天起算，不打断已有记录', () => {
    // 今天 8-25 没读，8-23/8-24 连续两天。
    const insights = buildReadingInsights(
      statsOf({ '2026-08-23': 20, '2026-08-24': 20 }),
      NOW,
    );
    expect(insights.currentStreak).toBe(2);
  });

  it('最长连续跨越更早的区间也能找到，并给出起止日期', () => {
    const insights = buildReadingInsights(
      statsOf({
        // 5 天连续
        '2026-06-01': 10,
        '2026-06-02': 10,
        '2026-06-03': 10,
        '2026-06-04': 10,
        '2026-06-05': 10,
        // 断开后只有 2 天
        '2026-08-24': 10,
        '2026-08-25': 10,
      }),
      NOW,
    );
    expect(insights.longestStreak).toEqual({
      days: 5,
      start: '2026-06-01',
      end: '2026-06-05',
    });
    expect(insights.currentStreak).toBe(2);
  });

  it('达标天数按每日目标计算，恰好达标算达标', () => {
    const insights = buildReadingInsights(
      statsOf({ '2026-08-23': 29, '2026-08-24': 30, '2026-08-25': 45 }, 30),
      NOW,
    );
    expect(insights.goalMetDays).toBe(2);
    expect(insights.goalMetRate).toBeCloseTo(2 / 3);
  });

  it('热力图按整周分列，每列 7 格且周日在首位', () => {
    const insights = buildReadingInsights(statsOf({ '2026-08-25': 30 }), NOW);
    expect(insights.heatmapWeeks.length).toBeGreaterThan(50);
    for (const week of insights.heatmapWeeks) {
      expect(week).toHaveLength(7);
      expect(new Date(`${week[0].date}T12:00:00`).getDay()).toBe(0);
    }
  });

  it('热力图末列补齐到本周六，未来日期标为占位不计入', () => {
    const insights = buildReadingInsights(statsOf({ '2026-08-25': 30 }), NOW);
    const lastWeek = insights.heatmapWeeks[insights.heatmapWeeks.length - 1];
    // 2026-08-25 是周二，本周余下的周三至周六属于未来。
    expect(lastWeek[lastWeek.length - 1].date).toBe('2026-08-29');
    const future = lastWeek.filter(cell => cell.date > '2026-08-25');
    expect(future).toHaveLength(4);
    expect(future.every(cell => cell.padding && cell.level === 0)).toBe(true);
  });

  it('色阶相对每日目标分级，达标当天到最高级', () => {
    const insights = buildReadingInsights(
      statsOf(
        {
          '2026-08-20': 5, // 1/6 目标
          '2026-08-21': 15, // 1/2
          '2026-08-22': 25, // 5/6
          '2026-08-23': 30, // 达标
          '2026-08-24': 90, // 超额
        },
        30,
      ),
      NOW,
    );
    const byDate = new Map(
      insights.heatmapWeeks.flat().map(cell => [cell.date, cell.level]),
    );
    expect(byDate.get('2026-08-20')).toBe(1);
    expect(byDate.get('2026-08-21')).toBe(2);
    expect(byDate.get('2026-08-22')).toBe(3);
    expect(byDate.get('2026-08-23')).toBe(4);
    expect(byDate.get('2026-08-24')).toBe(4);
    expect(byDate.get('2026-08-19')).toBe(0);
  });

  it('周内分布按星期归集，能看出常读的是哪几天', () => {
    // 2026-08-24 是周一，8-25 周二。
    const insights = buildReadingInsights(
      statsOf({ '2026-08-24': 60, '2026-08-17': 40, '2026-08-25': 10 }),
      NOW,
    );
    const monday = insights.weekdays[1];
    expect(monday.label).toBe('一');
    expect(monday.totalMinutes).toBe(100);
    expect(monday.activeDays).toBe(2);
    expect(monday.averageMinutes).toBe(50);
    expect(insights.weekdays[2].totalMinutes).toBe(10);
    expect(insights.weekdays[0].totalMinutes).toBe(0);
  });

  it('月度返回近 12 个月且按时间正序，末项是本月', () => {
    const insights = buildReadingInsights(
      statsOf({ '2026-08-25': 30, '2026-07-10': 20, '2026-07-11': 25 }),
      NOW,
    );
    expect(insights.monthly).toHaveLength(12);
    expect(insights.monthly[11].month).toBe('2026-08');
    expect(insights.monthly[11].totalMinutes).toBe(30);
    const july = insights.monthly.find(item => item.month === '2026-07');
    expect(july?.totalMinutes).toBe(45);
    expect(july?.activeDays).toBe(2);
  });

  it('近 30 天只统计窗口内的记录', () => {
    const insights = buildReadingInsights(
      statsOf({ '2026-08-25': 30, '2026-08-01': 20, '2026-05-01': 999 }),
      NOW,
    );
    expect(insights.last30Minutes).toBe(50);
    expect(insights.last30ActiveDays).toBe(2);
  });

  it('没有任何记录时各项归零且不抛错', () => {
    const insights = buildReadingInsights(statsOf({}), NOW);
    expect(insights.totalMinutes).toBe(0);
    expect(insights.activeDays).toBe(0);
    expect(insights.currentStreak).toBe(0);
    expect(insights.longestStreak).toBeUndefined();
    expect(insights.bestDay).toBeUndefined();
    expect(insights.goalMetRate).toBe(0);
    expect(insights.spanDays).toBe(0);
    expect(insights.monthly).toHaveLength(12);
  });
});

describe('formatMinutes', () => {
  it('按时长选择合适的表述', () => {
    expect(formatMinutes(0)).toBe('0 分钟');
    expect(formatMinutes(45)).toBe('45 分钟');
    expect(formatMinutes(60)).toBe('1 小时');
    expect(formatMinutes(200)).toBe('3 小时 20 分');
  });
});
