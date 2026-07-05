/**
 * 添加网络书籍弹窗：粘贴书源 URL → 解析入库 → 回调打开详情。
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon } from './index';
import { SERIF_FONT } from '../theme/fonts';
import { useAddOnlineBook } from '../store';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdded: (bookId: string) => void;
}

const PLACEHOLDER = 'http://wap.bookshuku.org/bookinfo/160297.html';

export function AddOnlineBookModal({ visible, onClose, onAdded }: Props) {
  const { theme } = useTheme();
  const addOnlineBook = useAddOnlineBook();
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const reset = () => {
    setUrl('');
    setBusy(false);
    setError('');
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (busy) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setError('请粘贴书籍链接');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const book = await addOnlineBook(trimmed);
      reset();
      onClose();
      onAdded(book.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败，请检查链接后重试');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[
            styles.panel,
            { backgroundColor: theme.colors.surface },
            theme.shadows.md,
          ]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              添加网络书籍
            </Text>
            <Pressable onPress={handleClose} hitSlop={8} disabled={busy}>
              <Icon name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <Text variant="caption" color="textSecondary" style={styles.hint}>
            粘贴书源书籍页链接（支持 bookshuku.org、mingzw.net）
          </Text>

          <TextInput
            value={url}
            onChangeText={t => {
              setUrl(t);
              if (error) setError('');
            }}
            placeholder={PLACEHOLDER}
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
            onSubmitEditing={handleSubmit}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: error ? theme.colors.danger : theme.colors.border,
                backgroundColor: theme.colors.background,
              },
            ]}
          />

          {!!error && (
            <Text style={[styles.error, { color: theme.colors.danger }]}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={busy}
            style={[
              styles.submit,
              { backgroundColor: theme.colors.accentDark, opacity: busy ? 0.7 : 1 },
            ]}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.submitText}>正在解析目录…</Text>
              </View>
            ) : (
              <Text style={styles.submitText}>添加到书架</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 17,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  hint: { marginTop: 8, marginBottom: 12 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    fontSize: 13.5,
  },
  error: { fontSize: 12, marginTop: 8 },
  submit: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
