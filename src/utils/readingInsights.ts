/**
 * 阅读足迹的深度派生指标。
 *
 * 原始数据只有 ReadingStats.secondsByDate（每天累计阅读秒数），这里把它展开成
 * 二级页需要的各种视角：年度热力图、周内分布、月度趋势、连续记录与达标率。
 * 与 summarizeReadingStats 的分工是：那边只算首页卡片要的几个数，这里算完整
 * 报表，遍历成本更高，只在打开二级页时调用。
 */

import type { ReadingStats } from '../store/types/stats';
import { dateKey, DEFAULT_DAILY_READING_GOAL_MINUTES } from '../store/types/stats';

/** 热力图色阶：0 表示当天没读。 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  date: string;
  minutes: number;
  level: HeatLevel;
  /** 超出统计范围（用于补齐首尾周），不参与配色与点击。 */
  padding?: boolean;
}

export interface WeekdayStat {
  /** 0=周日，与 Date.getDay() 一致。 */
  weekday: number;
  label: string;
  totalMinutes: number;
  activeDays: number;
  averageMinutes: number;
}

export interface MonthStat {
  /** YYYY-MM */
  month: string;
  label: string;
  totalMinutes: number;
  activeDays: number;
}

export interface StreakRange {
  days: number;
  start: string;
  end: string;
}

export interface ReadingInsights {
  totalMinutes: number;
  activeDays: number;
  /** 从首次阅读到今天的自然天数，用于算坚持率。 */
  spanDays: number;
  currentStreak: number;
  longestStreak?: StreakRange;
  averageMinutesPerActiveDay: number;
  bestDay?: { date: string; minutes: number };
  goalMinutes: number;
  goalMetDays: number;
  /** 达标天数占有阅读记录天数的比例，0~1。 */
  goalMetRate: number;
  firstDate?: string;
  /** 近 12 个月，按时间正序。 */
  monthly: MonthStat[];
  weekdays: WeekdayStat[];
  /** 热力图按周分列，每列 7 格（周日在上）。 */
  heatmapWeeks: HeatmapCell[][];
  /** 热力图覆盖的天数（含无记录的日子）。 */
  heatmapDays: number;
  last30Minutes: number;
  last30ActiveDays: number;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function minutesOf(stats: ReadingStats, key: string): number {
  return Math.round((stats.secondsByDate[key] ?? 0) / 60);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

/** 按当天分钟数分级；阈值相对每日目标，目标不同的人看到的色阶含义一致。 */
function levelOf(minutes: number, goalMinutes: number): HeatLevel {
  if (minutes <= 0) return 0;
  const ratio = minutes / Math.max(1, goalMinutes);
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}

/** 找出最长的连续阅读区间。 */
function findLongestStreak(activeKeys: string[]): StreakRange | undefined {
  if (activeKeys.length === 0) return undefined;
  const sorted = [...activeKeys].sort();
  let best: StreakRange = { days: 1, start: sorted[0], end: sorted[0] };
  let runStart = sorted[0];
  let runLength = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`);
    const expected = dateKey(addDays(prev, 1));
    if (sorted[i] === expected) {
      runLength += 1;
    } else {
      runStart = sorted[i];
      runLength = 1;
    }
    if (runLength > best.days) {
      best = { days: runLength, start: runStart, end: sorted[i] };
    }
  }
  return best;
}

export function buildReadingInsights(
  stats: ReadingStats,
  now: Date = new Date(),
  heatmapDays = 364,
): ReadingInsights {
  const goalMinutes =
    stats.dailyGoalMinutes && stats.dailyGoalMinutes > 0
      ? stats.dailyGoalMinutes
      : DEFAULT_DAILY_READING_GOAL_MINUTES;

  const activeKeys = Object.keys(stats.secondsByDate)
    .filter(key => (stats.secondsByDate[key] ?? 0) > 0)
    .sort();

  const totalMinutes = activeKeys.reduce(
    (sum, key) => sum + minutesOf(stats, key),
    0,
  );
  const activeDays = activeKeys.length;
  const firstDate = activeKeys[0];

  // 当前连续：与首页卡片同口径——今天还没读时允许从昨天起算。
  const has = (d: Date) => (stats.secondsByDate[dateKey(d)] ?? 0) > 0;
  const cursor = new Date(now);
  if (!has(cursor)) cursor.setDate(cursor.getDate() - 1);
  let currentStreak = 0;
  while (has(cursor)) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const bestDay = activeKeys.reduce<{ date: string; minutes: number } | undefined>(
    (best, key) => {
      const minutes = minutesOf(stats, key);
      return !best || minutes > best.minutes ? { date: key, minutes } : best;
    },
    undefined,
  );

  const goalMetDays = activeKeys.filter(
    key => minutesOf(stats, key) >= goalMinutes,
  ).length;

  // 热力图：从今天往前推满整周，保证每列都是完整的周日→周六。
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const tailPadding = 6 - today.getDay();
  const lastCell = addDays(today, tailPadding);
  const firstCell = addDays(lastCell, -(heatmapDays - 1 + tailPadding));
  const startOffset = firstCell.getDay();
  const gridStart = addDays(firstCell, -startOffset);
  const todayKey = dateKey(today);

  const heatmapWeeks: HeatmapCell[][] = [];
  let column: HeatmapCell[] = [];
  for (let offset = 0; ; offset += 1) {
    const day = addDays(gridStart, offset);
    if (day.getTime() > lastCell.getTime()) break;
    const key = dateKey(day);
    const minutes = minutesOf(stats, key);
    const future = key > todayKey;
    column.push({
      date: key,
      minutes: future ? 0 : minutes,
      level: future ? 0 : levelOf(minutes, goalMinutes),
      padding: future || day.getTime() < firstCell.getTime(),
    });
    if (column.length === 7) {
      heatmapWeeks.push(column);
      column = [];
    }
  }
  if (column.length > 0) heatmapWeeks.push(column);

  // 周内分布只统计热力图覆盖区间，避免早期零星数据拉低近期规律。
  const weekdayTotals = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    totalMinutes: 0,
    activeDays: 0,
    averageMinutes: 0,
  }));
  heatmapWeeks.flat().forEach(cell => {
    if (cell.padding || cell.minutes <= 0) return;
    const slot = weekdayTotals[new Date(`${cell.date}T12:00:00`).getDay()];
    slot.totalMinutes += cell.minutes;
    slot.activeDays += 1;
  });
  weekdayTotals.forEach(slot => {
    slot.averageMinutes =
      slot.activeDays > 0 ? Math.round(slot.totalMinutes / slot.activeDays) : 0;
  });

  // 近 12 个月，按时间正序。
  const monthly: MonthStat[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const month = `${anchor.getFullYear()}-${`${anchor.getMonth() + 1}`.padStart(2, '0')}`;
    const inMonth = activeKeys.filter(key => key.startsWith(month));
    monthly.push({
      month,
      label: `${anchor.getMonth() + 1}月`,
      totalMinutes: inMonth.reduce((sum, key) => sum + minutesOf(stats, key), 0),
      activeDays: inMonth.length,
    });
  }

  const last30Keys = Array.from({ length: 30 }, (_, index) =>
    dateKey(addDays(today, -index)),
  ).filter(key => (stats.secondsByDate[key] ?? 0) > 0);

  const spanDays = firstDate
    ? Math.round(
        (today.getTime() - new Date(`${firstDate}T12:00:00`).getTime()) /
          86400000,
      ) + 1
    : 0;

  return {
    totalMinutes,
    activeDays,
    spanDays,
    currentStreak,
    longestStreak: findLongestStreak(activeKeys),
    averageMinutesPerActiveDay:
      activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
    bestDay,
    goalMinutes,
    goalMetDays,
    goalMetRate: activeDays > 0 ? goalMetDays / activeDays : 0,
    firstDate,
    monthly,
    weekdays: weekdayTotals,
    heatmapWeeks,
    heatmapDays,
    last30Minutes: last30Keys.reduce(
      (sum, key) => sum + minutesOf(stats, key),
      0,
    ),
    last30ActiveDays: last30Keys.length,
  };
}

/** 把分钟数格式化成「3 小时 20 分」这类易读文案。 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 分钟';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}
