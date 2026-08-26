/**
 * 阅读足迹二级页。
 *
 * 「我的」页的卡片只呈现今日目标与最近一周，这里把 secondsByDate 展开成完整报表：
 * 年度热力图、周内分布、月度趋势与连续记录。所有指标都由 buildReadingInsights
 * 从同一份原始数据派生，不额外落盘任何统计字段。
 */

import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useAtomValue } from 'jotai';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { SERIF_FONT } from '../theme/fonts';
import { RootStackParamList } from '../types/navigation';
import { readingStatsAtom } from '../store/atoms';
import {
  buildReadingInsights,
  formatMinutes,
  type HeatLevel,
  type HeatmapCell,
} from '../utils/readingInsights';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CELL_SIZE = 11;
const CELL_GAP = 3;
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 色阶：0 用边框色描空格，1~4 逐级加深主题绿。 */
function heatColor(level: HeatLevel, empty: string, accent: string): string {
  if (level === 0) return empty;
  return accent + ['', '3d', '70', 'a8', 'ff'][level];
}

function formatDate(date?: string): string {
  if (!date) return '—';
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export default function ReadingStatsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const stats = useAtomValue(readingStatsAtom);
  const insights = React.useMemo(() => buildReadingInsights(stats), [stats]);
  const [picked, setPicked] = React.useState<HeatmapCell | null>(null);
  const heatScrollRef = React.useRef<ScrollView>(null);

  const monthMax = Math.max(
    1,
    ...insights.monthly.map(item => item.totalMinutes),
  );
  const weekdayMax = Math.max(
    1,
    ...insights.weekdays.map(item => item.totalMinutes),
  );
  const heatEmpty = theme.colors.border;
  // 热力图列首出现新月份时标一次月份，与 GitHub 贡献图的读法一致。
  const monthMarks = insights.heatmapWeeks.map((week, index) => {
    const month = Number(week[0].date.split('-')[1]);
    const prev =
      index > 0
        ? Number(insights.heatmapWeeks[index - 1][0].date.split('-')[1])
        : -1;
    return month !== prev ? MONTH_LABELS[month - 1] : '';
  });

  const metrics = [
    { label: '累计阅读', value: formatMinutes(insights.totalMinutes) },
    { label: '阅读天数', value: `${insights.activeDays} 天` },
    { label: '当前连续', value: `${insights.currentStreak} 天` },
    { label: '最长连续', value: `${insights.longestStreak?.days ?? 0} 天` },
  ];

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="返回"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>阅读足迹</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metricGrid}>
          {metrics.map(metric => (
            <View
              key={metric.label}
              style={[
                styles.metricCard,
                { backgroundColor: theme.colors.surface },
                theme.shadows.sm,
              ]}
            >
              <Text style={[styles.metricValue, { color: theme.colors.text }]}>
                {metric.value}
              </Text>
              <Text
                style={[styles.metricLabel, { color: theme.colors.textSecondary }]}
              >
                {metric.label}
              </Text>
            </View>
          ))}
        </View>

        {/* 年度热力图 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              过去一年
            </Text>
            <Text style={[styles.cardMeta, { color: theme.colors.textSecondary }]}>
              {insights.activeDays} 天有记录
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            ref={heatScrollRef}
            // 只在内容尺寸确定时滚到最右展示最近几周。放在 ref 回调里会让每次
            // 重绘（例如点选格子）都把横向位置强制拉回去，看着像点击没生效。
            onContentSizeChange={() =>
              heatScrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            <View>
              <View style={styles.monthRow}>
                {monthMarks.map((mark, index) => (
                  // 槽位只占一列宽，月份文字绝对定位后可以横向溢出，
                  // 否则「4月」会被压成「4…」。
                  <View key={`${mark}-${index}`} style={styles.monthSlot}>
                    {mark ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.monthLabel,
                          { color: theme.colors.textSecondary },
                        ]}
                      >
                        {mark}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={styles.heatGrid}>
                {insights.heatmapWeeks.map(week => (
                  <View key={week[0].date} style={styles.heatColumn}>
                    {week.map(cell => (
                      <Pressable
                        key={cell.date}
                        disabled={cell.padding}
                        hitSlop={2}
                        onPress={() => setPicked(cell)}
                        style={[
                          styles.heatCell,
                          {
                            backgroundColor: heatColor(
                              cell.level,
                              heatEmpty,
                              theme.colors.accent,
                            ),
                            borderColor:
                              picked?.date === cell.date
                                ? theme.colors.text
                                : 'transparent',
                          },
                          cell.padding && styles.heatCellPadding,
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
          <View style={styles.legendRow}>
            <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
              {picked
                ? `${formatDate(picked.date)} · ${
                    picked.minutes > 0 ? formatMinutes(picked.minutes) : '未阅读'
                  }`
                : '点格子查看当天时长'}
            </Text>
            <View style={styles.legendScale}>
              <Text
                style={[styles.legendText, { color: theme.colors.textSecondary }]}
              >
                少
              </Text>
              {([0, 1, 2, 3, 4] as HeatLevel[]).map(level => (
                <View
                  key={level}
                  style={[
                    styles.legendCell,
                    {
                      backgroundColor: heatColor(
                        level,
                        heatEmpty,
                        theme.colors.accent,
                      ),
                    },
                  ]}
                />
              ))}
              <Text
                style={[styles.legendText, { color: theme.colors.textSecondary }]}
              >
                多
              </Text>
            </View>
          </View>
        </View>

        {/* 周内分布 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              一周里的习惯
            </Text>
            <Text style={[styles.cardMeta, { color: theme.colors.textSecondary }]}>
              按星期累计
            </Text>
          </View>
          <View style={styles.weekdayRow}>
            {insights.weekdays.map(day => (
              <View key={day.weekday} style={styles.weekdayItem}>
                <View style={styles.weekdayBarArea}>
                  <View
                    accessibilityLabel={`星期${day.label}共 ${day.totalMinutes} 分钟`}
                    style={[
                      styles.weekdayBar,
                      {
                        height: Math.max(
                          3,
                          Math.round((day.totalMinutes / weekdayMax) * 76),
                        ),
                        backgroundColor: theme.colors.accent,
                      },
                      day.totalMinutes === 0 && styles.emptyBar,
                    ]}
                  />
                </View>
                <Text
                  style={[styles.weekdayLabel, { color: theme.colors.text }]}
                >
                  {day.label}
                </Text>
                <Text
                  style={[
                    styles.weekdayMeta,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {day.activeDays} 天
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 月度趋势 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              近 12 个月
            </Text>
            <Text style={[styles.cardMeta, { color: theme.colors.textSecondary }]}>
              近 30 天 {formatMinutes(insights.last30Minutes)}
            </Text>
          </View>
          <View style={styles.monthChart}>
            {insights.monthly.map(month => (
              <View key={month.month} style={styles.monthItem}>
                <View style={styles.monthBarArea}>
                  <View
                    accessibilityLabel={`${month.label}共 ${month.totalMinutes} 分钟`}
                    style={[
                      styles.monthBar,
                      {
                        height: Math.max(
                          3,
                          Math.round((month.totalMinutes / monthMax) * 70),
                        ),
                        backgroundColor: theme.colors.accentDark,
                      },
                      month.totalMinutes === 0 && styles.emptyBar,
                    ]}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.monthChartLabel,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {month.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 记录明细 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
            记录
          </Text>
          {[
            {
              label: '日均时长',
              value: `${formatMinutes(insights.averageMinutesPerActiveDay)} / 阅读日`,
            },
            {
              label: '达标天数',
              value: `${insights.goalMetDays} 天 · 占 ${Math.round(
                insights.goalMetRate * 100,
              )}%（目标 ${insights.goalMinutes} 分钟）`,
            },
            {
              label: '读得最久',
              value: insights.bestDay
                ? `${formatDate(insights.bestDay.date)} · ${formatMinutes(
                    insights.bestDay.minutes,
                  )}`
                : '—',
            },
            {
              label: '最长连续',
              value: insights.longestStreak
                ? `${insights.longestStreak.days} 天 · ${formatDate(
                    insights.longestStreak.start,
                  )} 起`
                : '—',
            },
            {
              label: '开始阅读',
              value: insights.firstDate
                ? `${formatDate(insights.firstDate)} · 至今 ${insights.spanDays} 天`
                : '—',
            },
          ].map(row => (
            <View
              key={row.label}
              style={[styles.detailRow, { borderTopColor: theme.colors.border }]}
            >
              <Text
                style={[styles.detailLabel, { color: theme.colors.textSecondary }]}
              >
                {row.label}
              </Text>
              <Text
                style={[styles.detailValue, { color: theme.colors.text }]}
                numberOfLines={2}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
  },
  backButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    lineHeight: 36,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 40, paddingHorizontal: 20 },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  metricCard: {
    borderRadius: 12,
    flexGrow: 1,
    flexBasis: '46%',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricValue: {
    fontFamily: SERIF_FONT,
    fontSize: 19,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  metricLabel: { fontSize: 11.5, marginTop: 5 },
  card: { borderRadius: 12, marginTop: 12, padding: 16 },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 11.5 },
  monthRow: { flexDirection: 'row', height: 13, marginBottom: 4 },
  monthSlot: { width: CELL_SIZE + CELL_GAP },
  monthLabel: { fontSize: 9, left: 0, position: 'absolute', top: 0, width: 30 },
  heatGrid: { flexDirection: 'row' },
  heatColumn: { marginRight: CELL_GAP },
  heatCellPadding: { opacity: 0.35 },
  emptyBar: { opacity: 0.2 },
  heatCell: {
    borderRadius: 2,
    borderWidth: 1,
    height: CELL_SIZE,
    marginBottom: CELL_GAP,
    width: CELL_SIZE,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  legendScale: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  legendCell: { borderRadius: 2, height: 9, width: 9 },
  legendText: { fontSize: 10.5 },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekdayItem: { alignItems: 'center', flex: 1 },
  weekdayBarArea: { height: 78, justifyContent: 'flex-end' },
  weekdayBar: { borderRadius: 4, width: 16 },
  weekdayLabel: { fontSize: 12, marginTop: 7 },
  weekdayMeta: { fontSize: 9.5, marginTop: 2 },
  monthChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthItem: { alignItems: 'center', flex: 1 },
  monthBarArea: { height: 72, justifyContent: 'flex-end' },
  monthBar: { borderRadius: 3, width: 11 },
  monthChartLabel: { fontSize: 9, marginTop: 6 },
  detailRow: {
    borderTopWidth: 1,
    paddingVertical: 11,
  },
  detailLabel: { fontSize: 11.5 },
  detailValue: { fontSize: 13.5, marginTop: 4 },
});
