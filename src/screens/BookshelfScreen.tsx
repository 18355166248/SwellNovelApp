import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Card, Button } from '../components';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useBooks, useSelectBook, useAddBook, useSetChapters, useSetChapterContent } from '../store';
import type { Book } from '../store/types/book';
import DocPicker, { types as DocTypes, isCancel as isDocCancel } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { parseTxtChapters } from '../utils/txt';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function BookshelfScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [refreshing, setRefreshing] = React.useState(false);

  // 使用 Jotai 状态管理
  const books = useBooks();
  const selectBook = useSelectBook();
  const addBook = useAddBook();
  const setChapters = useSetChapters();
  const setChapterContent = useSetChapterContent();

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // 模拟刷新
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const handleImportTxt = React.useCallback(async () => {
    try {
      const results = await (DocPicker as any)({
        allowMultiSelection: false,
        types: [DocTypes?.plainText || 'public.plain-text'],
        copyTo: 'cachesDirectory',
      });
      const picked = Array.isArray(results) ? results[0] : results;
      if (!picked) return;
      const path = picked.fileCopyUri || picked.uri;
      if (!path) return;
      const filePath = path.startsWith('file://') ? path : path;
      const content = await RNFS.readFile(filePath.replace('file://', ''), 'utf8');
      const bookId = Date.now().toString();
      const title = (picked.name || '本地TXT').replace(/\.txt$/i, '');
      const newBook: Book = {
        id: bookId,
        title,
        author: '本地导入',
        filePath: filePath,
        fileFormat: 'txt',
        addedAt: Date.now(),
        updatedAt: Date.now(),
        progress: 0,
      };
      const chapters = parseTxtChapters(bookId, content);
      addBook(newBook);
      setChapters(bookId, chapters);
      selectBook(bookId);
      if (chapters.length > 0) {
        setChapterContent(chapters[0].content);
      }
      navigation.navigate('Reader', { bookId });
    } catch (e: any) {
      if (typeof isDocCancel === 'function' && isDocCancel(e)) return;
    }
  }, [addBook, navigation, selectBook, setChapters, setChapterContent]);

  const renderBookItem = ({ item }: { item: Book }) => (
    <Card
      style={styles.bookCard}
      onPress={() => {
        selectBook(item.id);
        navigation.navigate('Reader', { bookId: item.id });
      }}>
      <View style={styles.bookInfo}>
        <View style={[styles.bookCover, { backgroundColor: theme.colors.primary }, theme.shadows.sm]}>
          <Text variant="h3" style={{ color: '#FFFFFF' }}>
            {item.title.charAt(0)}
          </Text>
        </View>
        <View style={styles.bookDetails}>
          <Text variant="h3" numberOfLines={1}>
            {item.title}
          </Text>
          <Text variant="body" color="textSecondary" style={styles.author}>
            {item.author}
          </Text>
          {item.progress > 0 && (
            <Text variant="caption" color="textSecondary">
              阅读进度: {item.progress}%
            </Text>
          )}
        </View>
      </View>
    </Card>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}>
      {books.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          <Text variant="h2" style={styles.emptyText}>
            书架空空如也
          </Text>
          <Text variant="body" color="textSecondary" style={styles.emptySubtext}>
            点击下方按钮添加书籍
          </Text>
          <Button
            title="导入本地TXT"
            onPress={handleImportTxt}
            style={styles.addButton}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={books}
          renderItem={renderBookItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Button title="导入本地TXT" onPress={handleImportTxt} variant="outline" />
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  bookCard: {
    marginBottom: 12,
  },
  bookInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookCover: {
    width: 60,
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bookDetails: {
    flex: 1,
  },
  author: {
    marginTop: 4,
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginBottom: 8,
  },
  emptySubtext: {
    marginBottom: 24,
    textAlign: 'center',
  },
  addButton: {
    minWidth: 120,
  },
});
