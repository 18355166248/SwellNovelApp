import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { RootStackParamList } from '../types/navigation';
import { useAllBooks } from '../store';
import { Book } from '../store/types/book';
import {
  CONTINUE_CARD_GRADIENT,
  CONTINUE_CARD_GRADIENT_DIRECTION,
} from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const allBooks = useAllBooks();

  // 本地阅读器无书城后端，「发现」改为呈现真实书库：按最近阅读/加入排序。
  const recent = React.useMemo(
    () =>
      [...allBooks].sort(
        (a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt),
      ),
    [allBooks],
  );
  const hero = recent[0];
  const ranks = recent.filter(book => book.lastReadAt).slice(0, 6);
  const updates = allBooks.filter(book => (book.unreadUpdates || 0) > 0);
  const recentlyAdded = [...allBooks]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 6);
  const openDetail = (bookId: string) =>
    navigation.navigate('BookDetail', { bookId });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>发现</Text>
          <Text variant="caption" color="textSecondary" style={styles.subtitle}>
            {allBooks.length > 0
              ? `书库共 ${allBooks.length} 本 · 最近在读`
              : '导入本地 TXT，开始你的书架'}
          </Text>
        </View>
      </View>

      {hero ? (
        <Pressable onPress={() => openDetail(hero.id)}>
          <LinearGradient
            colors={CONTINUE_CARD_GRADIENT}
            {...CONTINUE_CARD_GRADIENT_DIRECTION}
            style={styles.feature}
          >
            <View style={styles.featureDeco} pointerEvents="none" />
            <Text style={styles.featureLabel}>
              {hero.progress > 0 ? '继续阅读' : '开始阅读'}
            </Text>
            <Text style={styles.featureTitle} numberOfLines={1}>
              {hero.title}
            </Text>
            <Text style={styles.featureDesc} numberOfLines={2}>
              {`${hero.author || '本地导入'} · 已读 ${hero.progress}%`}
            </Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <LinearGradient
          colors={CONTINUE_CARD_GRADIENT}
          {...CONTINUE_CARD_GRADIENT_DIRECTION}
          style={styles.feature}
        >
          <View style={styles.featureDeco} pointerEvents="none" />
          <Text style={styles.featureLabel}>书架空空</Text>
          <Text style={styles.featureTitle}>先去书架导入一本 TXT</Text>
          <Text style={styles.featureDesc}>
            导入后这里会展示你最近在读与书库速览。
          </Text>
        </LinearGradient>
      )}

      {ranks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            最近在读
          </Text>
          <View
            style={[
              styles.rankList,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            {ranks.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => openDetail(item.id)}
                style={[
                  styles.rankRow,
                  {
                    borderBottomColor:
                      index === ranks.length - 1
                        ? 'transparent'
                        : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rankNo,
                    {
                      color:
                        index === 0 ? theme.colors.danger : theme.colors.accent,
                    },
                  ]}
                >
                  {index + 1}
                </Text>
                <View style={styles.rankInfo}>
                  <Text
                    style={[styles.rankTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`${item.author || '本地导入'} · 已读 ${item.progress}%`}
                  </Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {updates.length > 0 && (
        <DiscoverList
          title="追更更新"
          books={updates}
          theme={theme}
          onOpen={openDetail}
          detail={book => `新增 ${book.unreadUpdates} 章`}
        />
      )}

      {recentlyAdded.length > 0 && (
        <DiscoverList
          title="最近加入"
          books={recentlyAdded}
          theme={theme}
          onOpen={openDetail}
          detail={book => `${book.author || '本地导入'} · 已读 ${book.progress}%`}
        />
      )}
    </ScrollView>
  );
}

function DiscoverList({
  title,
  books,
  theme,
  onOpen,
  detail,
}: {
  title: string;
  books: Book[];
  theme: ReturnType<typeof useTheme>['theme'];
  onOpen: (bookId: string) => void;
  detail: (book: Book) => string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      <View style={[styles.rankList, { backgroundColor: theme.colors.surface }, theme.shadows.sm]}>
        {books.map((book, index) => (
          <Pressable key={book.id} onPress={() => onOpen(book.id)} style={[styles.rankRow, { borderBottomColor: index === books.length - 1 ? 'transparent' : theme.colors.border }]}>
            <View style={[styles.updateDot, { backgroundColor: book.unreadUpdates ? theme.colors.danger : theme.colors.accent }]} />
            <View style={styles.rankInfo}>
              <Text style={[styles.rankTitle, { color: theme.colors.text }]} numberOfLines={1}>{book.title}</Text>
              <Text variant="caption" color="textSecondary">{detail(book)}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 8, paddingBottom: 88 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: SERIF_FONT,
    fontSize: 25,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    letterSpacing: 0.5,
  },
  subtitle: { marginTop: 3 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feature: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  featureDeco: {
    position: 'absolute',
    right: -20,
    top: -28,
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  featureLabel: {
    color: 'rgba(255,255,255,.62)',
    fontSize: 11,
    letterSpacing: 1,
  },
  featureTitle: {
    marginTop: 12,
    color: '#fff',
    fontFamily: SERIF_FONT,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  featureDesc: {
    marginTop: 8,
    color: 'rgba(255,255,255,.68)',
    fontSize: 12.5,
    lineHeight: 19,
  },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  sectionTitle: {
    fontSize: 13,
    marginBottom: 12,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
  rankList: { borderRadius: 8, overflow: 'hidden' },
  rankRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  rankNo: {
    width: 16,
    fontFamily: SERIF_FONT,
    fontSize: 15,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
  },
  updateDot: { borderRadius: 4, height: 8, width: 8 },
  rankInfo: { flex: 1 },
  rankTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 15,
    marginBottom: 3,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
