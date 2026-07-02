import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import {
  CONTINUE_CARD_GRADIENT,
  CONTINUE_CARD_GRADIENT_DIRECTION,
  NOVEL_ACCENT,
  NOVEL_GOLD,
} from '../theme/readerThemes';

const TOPICS = ['历史权谋', '东方玄幻', '悬疑探案', '近代群像'];
const RANKS = [
  { title: '观沧海', meta: '临川生 · 128.5万热度' },
  { title: '山河故人', meta: '江左 · 96.2万热度' },
  { title: '青蝉记', meta: '沈砚 · 81.7万热度' },
];

export default function DiscoverScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>发现</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            今日精选 · 适合通勤阅读
          </Text>
        </View>
        <Pressable
          style={[
            styles.iconBtn,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          <Icon name="auto-awesome" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      <LinearGradient
        colors={CONTINUE_CARD_GRADIENT}
        {...CONTINUE_CARD_GRADIENT_DIRECTION}
        style={styles.feature}
      >
        <View style={styles.featureDeco} pointerEvents="none" />
        <Text style={styles.featureLabel}>编辑推荐</Text>
        <Text style={styles.featureTitle}>海风、旧案与一封被抹去的信</Text>
        <Text style={styles.featureDesc}>
          从历史权谋到海岸悬疑，挑三本节奏稳、章节完整的长篇。
        </Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          热门题材
        </Text>
        <View style={styles.topicGrid}>
          {TOPICS.map((topic, index) => (
            <Pressable
              key={topic}
              style={[
                styles.topic,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
                theme.shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.topicMark,
                  { backgroundColor: index === 0 ? NOVEL_GOLD : NOVEL_ACCENT },
                ]}
              />
              <Text style={[styles.topicText, { color: theme.colors.text }]}>
                {topic}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          新书榜
        </Text>
        <View
          style={[
            styles.rankList,
            { backgroundColor: theme.colors.surface },
            theme.shadows.sm,
          ]}
        >
          {RANKS.map((item, index) => (
            <Pressable
              key={item.title}
              style={[
                styles.rankRow,
                {
                  borderBottomColor:
                    index === RANKS.length - 1
                      ? 'transparent'
                      : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.rankNo,
                  { color: index === 0 ? theme.colors.danger : theme.colors.accent },
                ]}
              >
                {index + 1}
              </Text>
              <View style={styles.rankInfo}>
                <Text style={[styles.rankTitle, { color: theme.colors.text }]}>
                  {item.title}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {item.meta}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={18}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 8, paddingBottom: 88 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    letterSpacing: 0.5,
  },
  subtitle: { marginTop: 3 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feature: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  featureDeco: {
    position: 'absolute',
    right: -20,
    top: -28,
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  featureLabel: {
    color: 'rgba(255,255,255,.62)',
    fontSize: 11,
    letterSpacing: 1,
  },
  featureTitle: {
    marginTop: 12,
    color: '#fff',
    fontFamily: SERIF_FONT,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  featureDesc: {
    marginTop: 8,
    color: 'rgba(255,255,255,.68)',
    fontSize: 12.5,
    lineHeight: 19,
  },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  sectionTitle: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topic: {
    width: '48.5%',
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  topicMark: { width: 7, height: 7, borderRadius: 4 },
  topicText: { fontSize: 13.5, fontWeight: '500' },
  rankList: { borderRadius: 8, overflow: 'hidden' },
  rankRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  rankNo: {
    width: 16,
    fontFamily: SERIF_FONT,
    fontSize: 15,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  rankInfo: { flex: 1 },
  rankTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    marginBottom: 3,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
