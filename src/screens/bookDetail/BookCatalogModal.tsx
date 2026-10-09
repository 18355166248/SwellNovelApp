import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text } from '../../components';
import type { Chapter } from '../../store/types/book';
import { useTheme } from '../../theme/ThemeContext';
import { detailPalette } from './detailPalette';

interface Props {
  chapters: Chapter[];
  currentIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}

const ROW_HEIGHT = 56;

/** 目录只消费已有章节元数据；搜索、倒序与滚动都不能请求正文或改变阅读进度。 */
export default function BookCatalogModal({
  chapters,
  currentIndex,
  onClose,
  onSelect,
}: Props) {
  const { isDarkMode } = useTheme();
  const palette = detailPalette(isDarkMode);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState('');
  const [descending, setDescending] = React.useState(false);
  const list = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = chapters
      .map((chapter, index) => ({ chapter, index }))
      .filter(
        ({ chapter, index }) =>
          !normalized ||
          chapter.title.toLowerCase().includes(normalized) ||
          String(index + 1) === normalized,
      );
    return descending ? items.reverse() : items;
  }, [chapters, descending, query]);
  const initialIndex = Math.max(
    0,
    list.findIndex(item => item.index === currentIndex),
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: palette.paper,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: palette.ink }]}>
            目录{' '}
            <Text style={[styles.count, { color: palette.secondary }]}>
              共 {chapters.length} 项
            </Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭章节目录"
            onPress={onClose}
            style={styles.button}
          >
            <Icon family="feather" name="x" size={19} color={palette.ink} />
          </Pressable>
        </View>
        <View style={[styles.searchRow, { borderBottomColor: palette.line }]}>
          <Icon
            family="feather"
            name="search"
            size={16}
            color={palette.secondary}
          />
          <TextInput
            accessibilityLabel="搜索章节"
            placeholder="搜索章节名称或序号"
            placeholderTextColor={palette.secondary}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.search,
              { color: palette.ink, backgroundColor: palette.surface },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={descending ? '切换为正序' : '切换为倒序'}
            onPress={() => setDescending(value => !value)}
            style={styles.button}
          >
            <Text style={[styles.sortLabel, { color: palette.accent }]}>
              {descending ? '倒序' : '正序'}
            </Text>
          </Pressable>
        </View>
        <FlatList
          // 搜索和排序后重建列表，避免沿用旧偏移；序号始终保留原始目录位置。
          key={`${descending}-${query}`}
          data={list}
          keyExtractor={item => item.chapter.id}
          initialScrollIndex={descending ? 0 : initialIndex}
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          initialNumToRender={18}
          maxToRenderPerBatch={16}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text color="textSecondary" style={styles.empty}>
              没有匹配的章节
            </Text>
          }
          renderItem={({ item: { chapter, index } }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`阅读目录第 ${index + 1} 项 ${chapter.title}`}
              accessibilityState={{ selected: index === currentIndex }}
              onPress={() => onSelect(index)}
              style={[
                styles.row,
                {
                  borderBottomColor: palette.line,
                  backgroundColor:
                    index === currentIndex ? palette.surface : palette.paper,
                },
              ]}
            >
              <Text style={[styles.number, { color: palette.secondary }]}>
                {index + 1}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.title, { color: palette.ink }]}
              >
                {chapter.title}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
    minHeight: 44,
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  search: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 15,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  count: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  sortLabel: { fontSize: 13, lineHeight: 20 },
  number: { width: 24, textAlign: 'right', fontSize: 12 },
  title: { flex: 1, fontSize: 14 },
  empty: { padding: 24, textAlign: 'center' },
});
