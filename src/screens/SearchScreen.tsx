import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Input, Button, Card } from '../components';
import { useBookSearch } from '../store';

export default function SearchScreen() {
  const { theme } = useTheme();
  const { query, setQuery, results } = useBookSearch();

  const handleSearch = () => {
    // 搜索功能已通过 useBookSearch hook 实现
    // results 会自动更新
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}>
      <View style={styles.searchContainer}>
        <Input
          placeholder="搜索书籍、作者..."
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          containerStyle={styles.inputContainer}
        />
        <Button
          title="搜索"
          onPress={handleSearch}
          style={styles.searchButton}
          disabled={!query.trim()}
        />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {results.length > 0 ? (
          results.map((book) => (
            <Card key={book.id} style={styles.placeholderCard}>
              <Text variant="h3" style={styles.placeholderTitle}>
                {book.title}
              </Text>
              <Text variant="body" color="textSecondary" style={styles.placeholderText}>
                {book.author}
              </Text>
            </Card>
          ))
        ) : query ? (
          <Card style={styles.placeholderCard}>
            <Text variant="h3" style={styles.placeholderTitle}>
              未找到结果
            </Text>
            <Text variant="body" color="textSecondary" style={styles.placeholderText}>
              没有找到匹配的书籍
            </Text>
          </Card>
        ) : (
          <>
            <Card style={styles.placeholderCard}>
              <Text variant="h3" style={styles.placeholderTitle}>
                搜索功能
              </Text>
              <Text variant="body" color="textSecondary" style={styles.placeholderText}>
                在搜索框中输入书名或作者名进行搜索
              </Text>
            </Card>

            <Card style={styles.placeholderCard}>
              <Text variant="h3" style={styles.placeholderTitle}>
                热门搜索
              </Text>
              <Text variant="body" color="textSecondary" style={styles.placeholderText}>
                热门搜索功能将在后续版本中实现
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    marginVertical: 0,
  },
  searchInput: {
    flex: 1,
  },
  searchButton: {
    alignSelf: 'flex-end',
    minWidth: 80,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  placeholderCard: {
    marginBottom: 16,
  },
  placeholderTitle: {
    marginBottom: 8,
  },
  placeholderText: {
    lineHeight: 24,
  },
});
