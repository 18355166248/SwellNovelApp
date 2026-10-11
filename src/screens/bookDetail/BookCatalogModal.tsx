import React from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

type CatalogItem = { chapter: Chapter; index: number };

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
  const [locateRequest, setLocateRequest] = React.useState(0);
  const listRef = React.useRef<FlatList<CatalogItem>>(null);
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const positioningAttempts = React.useRef(0);
  const normalizedQuery = query.trim().toLowerCase();
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
  const currentListIndex = list.findIndex(item => item.index === currentIndex);
  // 搜索从首个结果开始；显式定位续读时保留当前排序，清空筛选后再寻找原始目录位置。
  const initialIndex = normalizedQuery
    ? 0
    : descending && !locateRequest
    ? 0
    : Math.max(0, currentListIndex);
  const listKey = `${descending}-${query}-${locateRequest}`;
  React.useEffect(() => {
    positioningAttempts.current = 0;
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [listKey]);
  const onScrollToIndexFailed = (info: {
    index: number;
    averageItemLength: number;
  }) => {
    if (info.index < 0 || info.index >= list.length) return;
    // 完整标题使行高可变，不能再用固定高度虚构偏移；先靠近目标、待真实行高测量后重试。
    listRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: false,
    });
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (positioningAttempts.current++ >= 5) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      listRef.current?.scrollToIndex({ index: info.index, animated: false });
    }, 100);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        // 搜索键盘只压缩目录滚动区，关闭、清空与定位入口仍留在可见区域。
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.keyboardArea, { backgroundColor: palette.paper }]}
      >
        {/* 安全区单独放在内层，避免键盘避让覆盖底部留白，使末行落到 Home 指示条下。 */}
        <View
          style={[
            styles.container,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.heading, { color: palette.ink }]}>
              目录{' '}
              <Text style={[styles.count, { color: palette.secondary }]}>
                {normalizedQuery
                  ? `匹配 ${list.length} / ${chapters.length} 项`
                  : `共 ${chapters.length} 项`}
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
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={false}
              style={[
                styles.search,
                { color: palette.ink, backgroundColor: palette.surface },
              ]}
            />
            {!!query && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清空章节搜索"
                onPress={() => setQuery('')}
                style={styles.button}
              >
                <Icon
                  family="feather"
                  name="x-circle"
                  size={18}
                  color={palette.secondary}
                />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={descending ? '切换为正序' : '切换为倒序'}
              onPress={() => {
                setLocateRequest(0);
                setDescending(value => !value);
              }}
              style={styles.button}
            >
              <Text style={[styles.sortLabel, { color: palette.accent }]}>
                {descending ? '倒序' : '正序'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.locationRow}>
            <Text style={[styles.locationHint, { color: palette.secondary }]}>
              点击章节开始阅读
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="定位续读章节"
              accessibilityState={{
                disabled: !chapters[currentIndex],
              }}
              disabled={!chapters[currentIndex]}
              onPress={() => {
                Keyboard.dismiss();
                setQuery('');
                setLocateRequest(value => value + 1);
              }}
              style={styles.locateButton}
            >
              <Icon
                family="feather"
                name="crosshair"
                size={15}
                color={palette.accent}
              />
              <Text style={[styles.sortLabel, { color: palette.accent }]}>
                续读位置
              </Text>
            </Pressable>
          </View>
          <FlatList
            // 搜索和排序后重建列表，避免沿用旧偏移；序号始终保留原始目录位置。
            key={listKey}
            ref={listRef}
            data={list}
            keyExtractor={item => item.chapter.id}
            initialScrollIndex={list.length ? initialIndex : undefined}
            onScrollToIndexFailed={onScrollToIndexFailed}
            initialNumToRender={18}
            maxToRenderPerBatch={16}
            windowSize={9}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <Text color="textSecondary" style={styles.empty}>
                没有匹配的章节
              </Text>
            }
            renderItem={({ item: { chapter, index } }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`阅读目录第 ${index + 1} 项 ${
                  chapter.title
                }`}
                accessibilityState={{ selected: index === currentIndex }}
                onPress={() => onSelect(index)}
                style={[
                  styles.row,
                  {
                    borderBottomColor: palette.line,
                    backgroundColor:
                      index === currentIndex
                        ? palette.accentSurface
                        : palette.paper,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.number,
                    {
                      width: Math.max(36, String(chapters.length).length * 9),
                      color: palette.secondary,
                    },
                  ]}
                >
                  {index + 1}
                </Text>
                <Text style={[styles.title, { color: palette.ink }]}>
                  {chapter.title}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 },
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
    minHeight: 56,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 10,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  count: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  sortLabel: { fontSize: 13, lineHeight: 20 },
  number: { textAlign: 'right', fontSize: 12, lineHeight: 20 },
  title: { flex: 1, fontSize: 14, lineHeight: 22 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationHint: { fontSize: 12, lineHeight: 18 },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  empty: { padding: 24, textAlign: 'center' },
});
