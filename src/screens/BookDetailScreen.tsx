import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Text, Icon, LinearGradient } from '../components';
import { SERIF_FONT } from '../theme/fonts';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types/navigation';
import {
  useAllBooks,
  useBookChapters,
  useOpenChapter,
  useRemoveBook,
  useCacheWholeBook,
  useCheckBookUpdate,
  useToggleBookFollow,
} from '../store';
import { resumeChapterIndex } from '../utils/chapters';
import {
  DETAIL_HERO_GRADIENT,
  paletteForId,
  COVER_GRADIENT_DIRECTION,
} from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'BookDetail'>;

function formatWordCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function relativeTime(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分钟前更新`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前更新`;
  return `${Math.floor(hr / 24)} 天前更新`;
}

function coverTitleFontSize(title: string, base: number) {
  return title.length >= 3 ? base - 2 : base;
}

function isBadBookshukuCatalog(
  sourceName: string | undefined,
  chapterTitles: string[],
) {
  if (sourceName !== 'bookshuku') return false;
  const fallbackTitleCount = chapterTitles.filter(title =>
    /^第\s*\d+\s*章$/i.test(title.trim()),
  ).length;
  const tooManyFallbackTitles =
    fallbackTitleCount >= Math.min(20, Math.ceil(chapterTitles.length * 0.5));
  return (
    chapterTitles.length > 0 &&
    (chapterTitles.length <= 20 ||
      chapterTitles.some(title => /^分节阅读\s*\d+$/i.test(title.trim())) ||
      tooManyFallbackTitles)
  );
}

export default function BookDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<DetailRoute>();
  const insets = useSafeAreaInsets();
  const { bookId } = route.params;
  const books = useAllBooks();
  const book = books.find(b => b.id === bookId);
  const chapters = useBookChapters(bookId);
  const openChapter = useOpenChapter();
  const removeBook = useRemoveBook();
  const cacheWholeBook = useCacheWholeBook();
  const checkBookUpdate = useCheckBookUpdate();
  const toggleBookFollow = useToggleBookFollow();
  const palette = paletteForId(bookId);
  const bottomActionOffset = Math.max(insets.bottom, 34) + 18;

  // 在线书专属：检查更新 / 缓存全本的进行态与结果提示。
  const [checking, setChecking] = React.useState(false);
  const [caching, setCaching] = React.useState({ active: false, done: 0, total: 0 });
  const [onlineMsg, setOnlineMsg] = React.useState('');
  const [showDeletePrompt, setShowDeletePrompt] = React.useState(false);
  const autoRepairCatalogRef = React.useRef(false);
  // 缓存全本可中断：离开页面或点“停止”时 abort，避免后台继续抓取。
  const cacheAbortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => cacheAbortRef.current?.abort(), []);
  const cachedCount = chapters.filter(c => c.content).length;
  const cachePct =
    caching.total > 0 ? Math.round((caching.done / caching.total) * 100) : 0;

  const onCheckUpdate = async () => {
    if (checking || caching.active) return;
    setChecking(true);
    setOnlineMsg('');
    try {
      const n = await checkBookUpdate(bookId);
      setOnlineMsg(n > 0 ? `发现 ${n} 个新章节` : '已是最新章节');
    } catch {
      setOnlineMsg('检查更新失败，请检查网络后重试');
    } finally {
      setChecking(false);
    }
  };

  const chapterTitlesKey = chapters.map(c => c.title).join('|');
  React.useEffect(() => {
    if (
      !book ||
      autoRepairCatalogRef.current ||
      !isBadBookshukuCatalog(
        book.source?.name,
        chapters.map(c => c.title),
      )
    ) {
      return;
    }
    autoRepairCatalogRef.current = true;
    setChecking(true);
    setOnlineMsg('正在修复目录…');
    // 兼容旧版本已落盘的坏目录：详情页发现“分节阅读 N”或大量“第 N 章”
    // 占位目录时，自动重拉完整目录并整表替换，避免用户必须删书重加。
    checkBookUpdate(book.id)
      .then(n => {
        setOnlineMsg(n > 0 ? `已修复目录，更新 ${n} 章` : '目录已是最新');
      })
      .catch(() => {
        autoRepairCatalogRef.current = false;
        setOnlineMsg('目录修复失败，请稍后重试');
      })
      .finally(() => setChecking(false));
  }, [book, chapterTitlesKey, chapters, checkBookUpdate]);

  const onCacheAll = async () => {
    // 已在缓存时，再次点击即停止。
    if (caching.active) {
      cacheAbortRef.current?.abort();
      return;
    }
    if (checking) return;
    const controller = new AbortController();
    cacheAbortRef.current = controller;
    setCaching({ active: true, done: cachedCount, total: chapters.length });
    setOnlineMsg('');
    try {
      const res = await cacheWholeBook(
        bookId,
        p => setCaching({ active: true, done: p.done, total: p.total }),
        controller.signal,
      );
      setOnlineMsg(
        res.cancelled
          ? `已停止，缓存了 ${res.done}/${res.total} 章`
          : res.done >= res.total
          ? `已缓存全部 ${res.total} 章，可离线阅读`
          : `已缓存 ${res.done}/${res.total} 章（部分失败，可重试）`,
      );
    } catch {
      setOnlineMsg('缓存失败，请检查网络后重试');
    } finally {
      cacheAbortRef.current = null;
      setCaching(prev => ({ ...prev, active: false }));
    }
  };

  if (!book) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text color="textSecondary">未找到书籍</Text>
      </View>
    );
  }

  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  const resumeIdx = resumeChapterIndex(chapters, book.currentChapterId);
  const preview = chapters.slice(-4).reverse();
  const latest = chapters[chapters.length - 1];
  const isFinished = book.progress >= 100;
  const chaptersReady = chapters.length > 0;

  const goReader = (idx: number) => {
    if (!chaptersReady) return;
    openChapter(book.id, idx);
    navigation.navigate('Reader', { bookId: book.id });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 180 + Math.max(insets.bottom, 34) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <LinearGradient
            colors={DETAIL_HERO_GRADIENT}
            {...COVER_GRADIENT_DIRECTION}
            style={StyleSheet.absoluteFill}
          />
          {/* 设计稿右上角的金色径向光斑，用半透明大圆近似 */}
          <View style={styles.heroGlow} pointerEvents="none" />
          <View style={[styles.heroContent, { paddingTop: insets.top + 10 }]}>
            <View style={styles.heroTopRow}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={styles.heroBtn}
              >
                <Icon name="arrow-back" size={20} color="#fff" />
              </Pressable>
              <Pressable
                accessibilityLabel="删除书籍"
                style={[styles.heroBtn, styles.deleteHeroBtn]}
                onPress={() => setShowDeletePrompt(true)}
              >
                <Icon name="delete-outline" size={20} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.heroBody}>
              <LinearGradient
                colors={[palette.from, palette.to]}
                {...COVER_GRADIENT_DIRECTION}
                style={[styles.heroCover, styles.heroCoverShadow]}
              >
                <Text
                  numberOfLines={2}
                  maxFontSizeMultiplier={1}
                  style={[
                    styles.heroCoverText,
                    {
                      color: palette.ink,
                      fontSize: coverTitleFontSize(book.title, 17),
                      lineHeight: coverTitleFontSize(book.title, 17) + 4,
                    },
                  ]}
                >
                  {book.title}
                </Text>
              </LinearGradient>
              <View style={styles.heroInfo}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {book.title}
                </Text>
                <Text style={styles.heroAuthor} numberOfLines={1}>
                  {book.author}
                </Text>
                <View style={styles.tagRow}>
                  <View
                    style={[
                      styles.tag,
                      { borderColor: 'rgba(240,217,168,.5)' },
                    ]}
                  >
                    <Text style={{ color: '#f0d9a8', fontSize: 11 }}>
                      {isFinished ? '已完结' : '连载中'}
                    </Text>
                  </View>
                  {book.fileFormat === 'txt' && (
                    <View
                      style={[
                        styles.tag,
                        { borderColor: 'rgba(255,255,255,.25)' },
                      ]}
                    >
                      <Text
                        style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}
                      >
                        本地导入
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{chapters.length}</Text>
                <Text style={styles.statLabel}>章节</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatWordCount(totalWords)}
                </Text>
                <Text style={styles.statLabel}>字数</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{book.progress}%</Text>
                <Text style={styles.statLabel}>进度</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>
            内容简介
          </Text>
          <Text style={[styles.synopsis, { color: theme.colors.text }]}>
            {book.description || '这本书还没有简介。'}
          </Text>
        </View>

        {latest && (
          <View
            style={[
              styles.updateCard,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            <View
              style={[styles.dot, { backgroundColor: theme.colors.danger }]}
            />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.text, fontSize: 13 }}
              >
                第 {chapters.length} 章 · {latest.title}
              </Text>
              <Text
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 2 }}
              >
                {relativeTime(book.updatedAt)}
              </Text>
            </View>
            <Text style={{ color: theme.colors.accent, fontSize: 12 }}>
              最新
            </Text>
          </View>
        )}

        {book.source && (
          <View style={styles.section}>
            <View style={styles.onlineRow}>
              <Pressable
                onPress={() => toggleBookFollow(bookId)}
                style={[styles.onlineBtn, { backgroundColor: book.following ? theme.colors.accentDark : theme.colors.surface, borderColor: book.following ? theme.colors.accentDark : theme.colors.border }]}
              >
                <Icon name={book.following ? 'notifications-active' : 'notifications-none'} size={16} color={book.following ? '#fff' : theme.colors.accentDark} />
                <Text style={{ fontSize: 13, color: book.following ? '#fff' : theme.colors.text }}>
                  {book.following ? '追更中' : '追更'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onCheckUpdate}
                disabled={checking || caching.active}
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: checking || caching.active ? 0.5 : 1,
                  },
                ]}
              >
                <Icon name="refresh" size={16} color={theme.colors.accentDark} />
                <Text style={{ fontSize: 13, color: theme.colors.text }}>
                  {checking ? '检查中…' : '检查更新'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onCacheAll}
                disabled={checking}
                style={[
                  styles.onlineBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: checking ? 0.5 : 1,
                  },
                ]}
              >
                <Icon
                  name={caching.active ? 'stop' : 'download'}
                  size={16}
                  color={theme.colors.accentDark}
                />
                <Text style={{ fontSize: 13, color: theme.colors.text }}>
                  {caching.active ? `缓存中 ${cachePct}% · 停止` : '缓存全本'}
                </Text>
              </Pressable>
            </View>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginTop: 8 }}
            >
              {onlineMsg ||
                `已缓存 ${cachedCount}/${chapters.length} 章，可离线阅读`}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.tocHeader}>
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.colors.text, marginBottom: 0 },
              ]}
            >
              目录
            </Text>
            <Pressable
              disabled={!chaptersReady}
              accessibilityState={{ disabled: !chaptersReady }}
              onPress={() => {
                // 目录入口也要先恢复本书的续读章，避免复用上一册的全局章节索引。
                openChapter(book.id, resumeIdx);
                navigation.navigate('Reader', {
                  bookId: book.id,
                  openDrawer: true,
                });
              }}
              style={[styles.tocMore, { opacity: chaptersReady ? 1 : 0.45 }]}
            >
              <Text variant="caption" color="textSecondary">
                {chaptersReady ? `共 ${chapters.length} 章` : '目录加载中…'}
              </Text>
              <Icon
                name="chevron-right"
                size={15}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>
          <View
            style={[
              styles.tocList,
              { backgroundColor: theme.colors.surface },
              theme.shadows.sm,
            ]}
          >
            {preview.map(c => {
              const idx = chapters.indexOf(c);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => goReader(idx)}
                  style={[
                    styles.tocRow,
                    { borderBottomColor: theme.colors.border },
                  ]}
                >
                  <Text
                    variant="caption"
                    color="textSecondary"
                    style={{ width: 30 }}
                  >
                    {idx + 1}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      color: theme.colors.text,
                    }}
                  >
                    {c.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {showDeletePrompt ? (
        <View style={styles.deleteBackdrop}>
          <View
            style={[
              styles.deleteDialog,
              { backgroundColor: theme.colors.surface },
              theme.shadows.md,
            ]}
          >
            <Text style={[styles.deleteTitle, { color: theme.colors.text }]}>
              删除书籍
            </Text>
            <Text style={[styles.deleteMessage, { color: theme.colors.textSecondary }]}>
              确定删除《{book.title}》？章节缓存、阅读进度与书签都会被永久清除。
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.deleteButton, { borderColor: theme.colors.border }]}
                onPress={() => setShowDeletePrompt(false)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteButton, { backgroundColor: theme.colors.danger }]}
                onPress={() => {
                  removeBook(book.id);
                  setShowDeletePrompt(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.deleteConfirmText}>删除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.actionBarWrap, { bottom: bottomActionOffset }]}
      >
        {/* 渐变只做背景，按钮由外层 View 控位，避免 iOS 安全区下半截被裁。 */}
        <LinearGradient
          colors={[
            `${theme.colors.background}00`,
            theme.colors.background,
            theme.colors.background,
          ]}
          locations={[0, 0.3, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.actionBar}>
          <Pressable
            // 底部“书架”是详情页的返回动作，保持和顶部返回一致，避免重新打开一个书架路由。
            onPress={() => navigation.goBack()}
            style={[styles.shelfBtn, { borderColor: theme.colors.accentDark }]}
          >
            <Icon
              name="bookmark-border"
              size={19}
              color={theme.colors.accentDark}
            />
            <Text
              style={{
                fontSize: 9,
                color: theme.colors.accentDark,
                marginTop: 2,
              }}
              numberOfLines={1}
              maxFontSizeMultiplier={1}
            >
              书架
            </Text>
          </Pressable>
          <Pressable
            disabled={!chaptersReady}
            accessibilityState={{ disabled: !chaptersReady }}
            onPress={() => goReader(resumeIdx)}
            style={[
              styles.readBtn,
              {
                backgroundColor: theme.colors.accentDark,
                opacity: chaptersReady ? 1 : 0.45,
              },
            ]}
          >
            <Text
              style={styles.readBtnText}
              numberOfLines={1}
              maxFontSizeMultiplier={1}
            >
              {!chaptersReady
                ? '章节加载中…'
                : book.progress > 0
                ? `继续阅读 · 第 ${resumeIdx + 1} 章`
                : '开始阅读'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,.42)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
  },
  deleteDialog: {
    borderRadius: 8,
    maxWidth: 360,
    padding: 20,
    width: '100%',
  },
  deleteTitle: { fontSize: 18, fontWeight: '700' },
  deleteMessage: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  deleteButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  deleteConfirmText: { color: '#fff', fontWeight: '600' },
  deleteHeroBtn: { backgroundColor: 'rgba(180,53,53,.82)' },
  hero: {
    position: 'relative',
    overflow: 'hidden',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  // 近似设计稿 radial-gradient(90% 60% at 80% 0%, rgba(201,161,94,.22), transparent)
  heroGlow: {
    position: 'absolute',
    top: -110,
    right: -70,
    width: 300,
    height: 260,
    borderRadius: 150,
    backgroundColor: 'rgba(201,161,94,.14)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 36,
    alignItems: 'center',
  },
  heroBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flexDirection: 'row', gap: 16, marginTop: 16 },
  heroCover: {
    width: 82,
    height: 112,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 对齐设计稿封面投影 0 12px 28px -8px rgba(0,0,0,.5)
  heroCoverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  heroCoverText: {
    fontFamily: SERIF_FONT,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    textAlign: 'center',
  },
  heroInfo: { flex: 1, paddingTop: 2 },
  heroTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 23,
    fontWeight: Platform.select({ ios: '700', android: 'bold' }),
    color: '#fff',
  },
  heroAuthor: { fontSize: 13, color: 'rgba(255,255,255,.72)', marginTop: 8 },
  tagRow: { flexDirection: 'row', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.12)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily: SERIF_FONT,
    fontSize: 16,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    color: '#fff',
  },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 3 },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
    marginBottom: 8,
  },
  // 设计稿正文行高 1.85（14 × 1.85 ≈ 26）
  synopsis: { fontFamily: SERIF_FONT, fontSize: 14, lineHeight: 26 },
  updateCard: {
    marginHorizontal: 20,
    marginTop: 18,
    padding: 13,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  onlineRow: { flexDirection: 'row', gap: 10 },
  onlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
  },
  tocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tocMore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tocList: { marginTop: 8, borderRadius: 8, overflow: 'hidden' },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  actionBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 104,
    justifyContent: 'flex-end',
  },
  actionBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  shelfBtn: {
    width: 58,
    height: 54,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtn: {
    flex: 1,
    height: 54,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    // 设计稿主按钮投影 0 6px 16px -6px rgba(31,61,58,.6)
    shadowColor: '#1f3d3a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  readBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: Platform.select({ ios: '600', android: 'bold' }),
  },
});
