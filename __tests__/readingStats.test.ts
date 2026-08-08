import {
  DEFAULT_DAILY_READING_GOAL_MINUTES,
  summarizeReadingStats,
} from '../src/store/types/stats';

describe('reading stats summary', () => {
  it('生成近七天趋势、今日目标与连续阅读天数', () => {
    const summary = summarizeReadingStats(
      {
        dailyGoalMinutes: 30,
        secondsByDate: {
          '2026-08-03': 600,
          '2026-08-07': 1800,
          '2026-08-08': 900,
        },
      },
      new Date(2026, 7, 8, 12),
    );

    expect(summary.todayMinutes).toBe(15);
    expect(summary.todayGoalProgress).toBe(0.5);
    expect(summary.weekTotalMinutes).toBe(55);
    expect(summary.streak).toBe(2);
    expect(summary.week.map(day => day.label)).toEqual([
      '日',
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
    ]);
  });

  it('旧数据没有目标时使用默认值，超过目标时进度封顶', () => {
    const now = new Date(2026, 7, 8, 12);
    const summary = summarizeReadingStats(
      { secondsByDate: { '2026-08-08': 7200 } },
      now,
    );

    expect(summary.dailyGoalMinutes).toBe(
      DEFAULT_DAILY_READING_GOAL_MINUTES,
    );
    expect(summary.todayGoalProgress).toBe(1);
  });
});
