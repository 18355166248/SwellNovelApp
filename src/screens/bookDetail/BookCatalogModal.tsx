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
  const { theme } = useTheme();
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
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <Text variant="h3">目录 · 共 {chapters.length} 项</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭章节目录"
            onPress={onClose}
            style={styles.button}
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="搜索章节"
            placeholder="搜索章节名称或序号"
            placeholderTextColor={theme.colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.search,
              { color: theme.colors.text, borderColor: theme.colors.border },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={descending ? '切换为正序' : '切换为倒序'}
            onPress={() => setDescending(value => !value)}
            style={styles.button}
          >
            <Text>{descending ? '倒序' : '正序'}</Text>
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
                  borderBottomColor: theme.colors.border,
                  backgroundColor:
                    index === currentIndex
                      ? theme.colors.surface
                      : theme.colors.background,
                },
              ]}
            >
              <Text color="textSecondary" style={styles.number}>
                {index + 1}
              </Text>
              <Text numberOfLines={1} style={styles.title}>
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
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
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  search: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    gap: 12,
  },
  number: { width: 40, fontSize: 12 },
  title: { flex: 1, fontSize: 14 },
  empty: { padding: 24, textAlign: 'center' },
});
