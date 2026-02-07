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
import { useBooks, useSelectBook, useAddBook } from '../store';
import type { Book } from '../store/types/book';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function BookshelfScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [refreshing, setRefreshing] = React.useState(false);
  
  // 使用 Jotai 状态管理
  const books = useBooks();
  const selectBook = useSelectBook();
  const addBook = useAddBook();

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // 模拟刷新
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const renderBookItem = ({ item }: { item: Book }) => (
    <Card
      style={styles.bookCard}
      onPress={() => {
        selectBook(item.id);
        navigation.navigate('Reader', { bookId: item.id });
      }}>
      <View style={styles.bookInfo}>
        <View style={[styles.bookCover, { backgroundColor: theme.colors.primary }]}>
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
            title="添加书籍"
            onPress={() => {
              // 临时添加示例书籍，后续实现真实的添加功能
              const newBook: Book = {
                id: Date.now().toString(),
                title: `示例书籍 ${books.length + 1}`,
                author: '示例作者',
                addedAt: Date.now(),
                updatedAt: Date.now(),
                progress: 0,
              };
              addBook(newBook);
            }}
            style={styles.addButton}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={books}
          renderItem={renderBookItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
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
