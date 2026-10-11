import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icon } from '../../components';
import { NOVEL_ACCENT } from '../../theme/readerThemes';

export interface ExcerptDraft {
  chapterId: string;
  position: number;
  excerpt: string;
  note: string;
  originalNote: string;
  saved?: boolean;
  bookmarkId?: string;
  returnToList?: boolean;
}

interface Props {
  draft: ExcerptDraft;
  chapterTitle: string;
  bottomInset: number;
  colors: {
    background: string;
    field: string;
    ink: string;
    sub: string;
    border: string;
  };
  onChangeNote: (note: string) => void;
  onClose: () => void;
  onSave: () => void;
  onReturnToText?: () => void;
}

/** 查看与编辑共用面板；打开已有摘抄只读数据，显式返回原文才触发阅读跳转。 */
export default function ReaderExcerptSheet({
  draft,
  chapterTitle,
  bottomInset,
  colors,
  onChangeNote,
  onClose,
  onSave,
  onReturnToText,
}: Props) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭摘抄面板"
        onPress={onClose}
        style={styles.overlay}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardLayer}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: Math.max(bottomInset + 12, 24),
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: colors.ink }]}>
                {draft.saved ? '摘抄与笔记' : '保存摘抄'}
              </Text>
              <Text style={[styles.chapter, { color: colors.sub }]}>
                {chapterTitle}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭摘抄与笔记"
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" size={22} color={colors.sub} />
            </Pressable>
          </View>
          <ScrollView
            testID="excerpt-full-text"
            style={[styles.preview, { backgroundColor: colors.field }]}
            contentContainerStyle={styles.previewContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.quote, { color: colors.ink }]}>
              {draft.excerpt}
            </Text>
          </ScrollView>
          {draft.saved && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回摘抄原文"
              accessibilityState={{ disabled: !onReturnToText }}
              disabled={!onReturnToText}
              onPress={onReturnToText}
              style={styles.returnButton}
            >
              <Icon
                name="my-location"
                size={16}
                color={onReturnToText ? colors.ink : colors.sub}
              />
              <Text
                style={{
                  color: onReturnToText ? colors.ink : colors.sub,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {onReturnToText ? '回到原文' : '原章节暂不可用，摘抄仍已保留'}
              </Text>
            </Pressable>
          )}
          <TextInput
            accessibilityLabel="摘抄笔记"
            value={draft.note}
            onChangeText={onChangeNote}
            multiline
            maxLength={Math.max(500, draft.originalNote.length)}
            placeholder="写下想法（可选）"
            placeholderTextColor={colors.sub}
            style={[
              styles.note,
              { color: colors.ink, borderColor: colors.border },
            ]}
          />
          <Text style={[styles.count, { color: colors.sub }]}>
            {draft.note.length} / {Math.max(500, draft.originalNote.length)}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消编辑摘抄"
              onPress={onClose}
              style={[styles.button, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.sub, fontSize: 13 }}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存摘抄笔记"
              onPress={onSave}
              style={[
                styles.button,
                { backgroundColor: NOVEL_ACCENT, borderColor: NOVEL_ACCENT },
              ]}
            >
              <Text style={styles.saveText}>保存</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,.35)',
    zIndex: 7,
  },
  keyboardLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 8,
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  heading: { flex: 1, marginRight: 8 },
  title: { fontSize: 17, fontWeight: '600' },
  chapter: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { maxHeight: 220, flexShrink: 1, borderRadius: 10, marginBottom: 8 },
  previewContent: { paddingHorizontal: 13, paddingVertical: 11 },
  quote: { fontSize: 13, lineHeight: 20 },
  returnButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  note: {
    minHeight: 76,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  count: { fontSize: 11, textAlign: 'right', marginTop: 6, marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
