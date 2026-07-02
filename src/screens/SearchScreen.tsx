import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useBookSearch } from '../store';
import { paletteForId, COVER_GRADIENT_DIRECTION } from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const HOT = [
  { rank: '1', title: '观沧海', heat: '128.5万' },
  { rank: '2', title: '山河故人', heat: '96.2万' },
  { rank: '3', title: '青蝉记', heat: '81.7万' },
  { rank: '4', title: '归墟', heat: '54.0万' },
  { rank: '5', title: '故都的秋', heat: '38.9万' },
];
const RANK_COLORS = ['#c25a3a', '#c9852f', '#2e6b5e', '#9aa39a', '#9aa39a'];

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { query, setQuery, results } = useBookSearch();
  const [history, setHistory] = React.useState<string[]>([]);

  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    setQuery(trimmed);
    if (trimmed && !history.includes(trimmed)) {
      setHistory(prev => [trimmed, ...prev].slice(0, 8));
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <Icon name="search" size={16} color={theme.colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => commitSearch(query)}
              placeholder="搜索书名、作者"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.searchInput, { color: theme.colors.text }]}
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={() => commitSearch(query)}
            style={styles.searchBtn}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontSize: 14,
                fontWeight: Platform.select({ ios: '600', android: 'bold' }),
              }}
            >
              搜索
            </Text>
          </Pressable>
        </View>

        {query.trim().length > 0 && (
          <View style={styles.section}>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginBottom: 10 }}
            >
              找到 {results.length} 个结果
            </Text>
            {results.length === 0 ? (
              <Text variant="body" color="textSecondary">
                没有找到匹配的书籍
              </Text>
            ) : (
              results.map(r => {
                const palette = paletteForId(r.id);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() =>
                      navigation.navigate('BookDetail', { bookId: r.id })
                    }
                    style={[
                      styles.resultRow,
                      { borderBottomColor: theme.colors.border },
                    ]}
                  >
                    <LinearGradient
                      colors={[palette.from, palette.to]}
                      {...COVER_GRADIENT_DIRECTION}
                      style={[styles.resultCover, theme.shadows.sm]}
                    >
                      <Text
                        style={[styles.resultCoverText, { color: palette.ink }]}
                        numberOfLines={2}
                      >
                        {r.title}
                      </Text>
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 13 }}>
                      <View style={styles.resultTitleRow}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <View
                          style={[
                            styles.statusTag,
                            {
                              borderColor:
                                r.progress >= 100
                                  ? theme.colors.badgeMuted
                                  : theme.colors.danger,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color:
                                r.progress >= 100
                                  ? theme.colors.badgeMuted
                                  : theme.colors.danger,
                            }}
                          >
                            {r.progress >= 100 ? '已完结' : '连载中'}
                          </Text>
                        </View>
                      </View>
                      <Text
                        variant="caption"
                        color="textSecondary"
                        style={{ marginTop: 4 }}
                      >
                        {r.author} ·{' '}
                        {r.fileFormat === 'txt' ? '本地导入' : '在线书库'}
                      </Text>
                      {!!r.description && (
                        <Text
                          numberOfLines={2}
                          style={{
                            fontSize: 12,
                            color: theme.colors.textSecondary,
                            marginTop: 6,
                            lineHeight: 18.5,
                          }}
                        >
                          {r.description}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.colors.accent,
                          marginTop: 6,
                        }}
                      >
                        共 {r.totalChapters ?? '–'} 章 · 已读 {r.progress}%
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        <View style={styles.section}>
          {history.length > 0 && (
            <>
              <View style={styles.rowBetween}>
                <Text variant="label">搜索历史</Text>
                <Pressable onPress={() => setHistory([])}>
                  <Icon
                    name="delete-outline"
                    size={16}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {history.map(h => (
                  <Pressable
                    key={h}
                    onPress={() => commitSearch(h)}
                    style={[
                      styles.historyChip,
                      { backgroundColor: theme.colors.surface },
                      theme.shadows.sm,
                    ]}
                  >
                    <Text style={{ fontSize: 12.5, color: theme.colors.text }}>
                      {h}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text
            variant="label"
            style={{ marginTop: history.length ? 22 : 0, marginBottom: 12 }}
          >
            热门搜索
          </Text>
          <View
            style={[
              styles.hotList,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            {HOT.map((h, i) => (
              <Pressable
                key={h.rank}
                onPress={() => commitSearch(h.title)}
                style={[
                  styles.hotRow,
                  { borderBottomColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.hotRank, { color: RANK_COLORS[i] }]}>
                  {h.rank}
                </Text>
                <Text
                  style={{ flex: 1, fontSize: 13.5, color: theme.colors.text }}
                >
                  {h.title}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {h.heat}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  searchBtn: { paddingHorizontal: 2 },
  section: { paddingHorizontal: 20, paddingTop: 14 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  hotList: { borderRadius: 8, overflow: 'hidden' },
  hotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  hotRank: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    width: 16,
  },
  resultRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  resultCover: {
    width: 62,
    height: 84,
    borderRadius: 6,
    padding: 7,
    justifyContent: 'flex-end',
  },
  resultCoverText: {
    fontFamily: SERIF_FONT,
    fontSize: 14,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    lineHeight: 17,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  resultTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    flexShrink: 1,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
});
