import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Icon } from './index';
import { useTheme } from '../theme/ThemeContext';
import type { Chapter } from '../store/types/book';
import {
  readingRecordChapter,
  type DisplayReadingRecord,
} from '../utils/readingRecords';

interface Props {
  records: DisplayReadingRecord[];
  chapters: Chapter[];
  onSelect: (record: DisplayReadingRecord) => void;
  ink?: string;
  sub?: string;
  accent?: string;
  canSelect?: boolean;
}

function timeLabel(time: number) {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export default function ReadingRecordsList({
  records,
  chapters,
  onSelect,
  ink,
  sub,
  accent,
  canSelect = true,
}: Props) {
  const { theme } = useTheme();
  const text = ink ?? theme.colors.text;
  const secondary = sub ?? theme.colors.textSecondary;
  const highlight = accent ?? theme.colors.accentDark;
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      <Text style={[styles.help, { color: secondary }]}>
        目录跳转前自动留存位置，最多保留最近 30 条；点击即可返回。
      </Text>
      {!records.length && (
        <Text style={[styles.empty, { color: secondary }]}>
          开始阅读后显示最近位置，跳转目录时会自动留下记录。
        </Text>
      )}
      {records.map(record => {
        const chapter = readingRecordChapter(record, chapters);
        const title = chapter?.title ?? record.chapterTitle;
        const label = record.current ? '最近阅读' : '跳转前位置';
        const position =
          record.position === 0
            ? '章节开头'
            : chapter?.content.length
            ? `本章约 ${Math.min(
                100,
                Math.max(
                  1,
                  Math.round((record.position / chapter.content.length) * 100),
                ),
              )}%`
            : '已保存阅读位置';
        return (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            accessibilityLabel={`返回${label} ${title}`}
            accessibilityState={{ disabled: !chapter || !canSelect }}
            disabled={!chapter || !canSelect}
            onPress={() =>
              chapter && onSelect({ ...record, chapterId: chapter.id })
            }
            style={styles.row}
          >
            <View style={styles.rowHeading}>
              <Text style={[styles.label, { color: highlight }]}>{label}</Text>
              <Text style={[styles.time, { color: secondary }]}>
                {timeLabel(record.updatedAt)}
              </Text>
            </View>
            <Text style={[styles.title, { color: text }]}>{title}</Text>
            <Text style={[styles.position, { color: secondary }]}>
              {chapter ? position : '当前目录中找不到这一章，原记录已保留'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ReadingRecordsModal({
  onClose,
  ...props
}: Props & { onClose: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.modal,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <Text variant="h3">阅读记录</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭阅读记录"
            onPress={onClose}
            style={styles.close}
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>
        <ReadingRecordsList {...props} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  close: { padding: 10 },
  list: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  help: { fontSize: 12, lineHeight: 19, paddingVertical: 10 },
  empty: { fontSize: 13, lineHeight: 22, marginTop: 36, textAlign: 'center' },
  row: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  rowHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  label: { fontSize: 12, fontWeight: '600' },
  time: { fontSize: 11 },
  title: { fontSize: 15, lineHeight: 23, marginTop: 7 },
  position: { fontSize: 12, lineHeight: 18, marginTop: 5 },
});
