import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Icon } from '../components';
import {
  useAllBooks,
  useSelectBook,
  useBookChapters,
  useCurrentChapterIndex,
  useCurrentChapterContent,
  useOpenChapter,
  useReaderSettings,
  useReaderDisplay,
  useSetReaderTheme,
  useAdjustFontSize,
  useSetLineHeightIndex,
  useSetPageMode,
  useToggleToolbar,
  useSetToolbarVisible,
  useReaderState,
  useBookmarks,
  useToggleBookmark,
} from '../store';
import { READER_THEMES, ReaderThemeKey } from '../theme/readerThemes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ReaderRoute = RouteProp<RootStackParamList, 'Reader'>;

const LINE_LABELS = ['紧凑', '适中', '宽松'];
const THEME_ORDER: ReaderThemeKey[] = ['paper', 'gray', 'green', 'night'];

export default function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderRoute>();
  const { bookId, openDrawer } = route.params;

  const books = useAllBooks();
  const book = books.find((b) => b.id === bookId);
  const selectBook = useSelectBook();
  const chapters = useBookChapters(bookId);
  const chapterIndex = useCurrentChapterIndex() ?? 0;
  const content = useCurrentChapterContent();
  const openChapter = useOpenChapter();

  const settings = useReaderSettings();
  const display = useReaderDisplay();
  const setReaderTheme = useSetReaderTheme();
  const { inc: incFont, dec: decFont } = useAdjustFontSize();
  const setLineHeightIndex = useSetLineHeightIndex();
  const setPageMode = useSetPageMode();

  const { isToolbarVisible } = useReaderState();
  const toggleToolbar = useToggleToolbar();
  const setToolbarVisible = useSetToolbarVisible();

  const bookmarks = useBookmarks(bookId);
  const toggleBookmark = useToggleBookmark();

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(!!openDrawer);
  const [drawerOrder, setDrawerOrder] = React.useState<'asc' | 'desc'>('asc');
  const [drawerQuery, setDrawerQuery] = React.useState('');
  const [status, setStatus] = React.useState<'ready' | 'loading' | 'error'>('ready');
  const transitionRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    selectBook(bookId);
  }, [bookId, selectBook]);

  React.useEffect(() => () => {
    if (transitionRef.current) clearTimeout(transitionRef.current);
  }, []);

  const total = chapters.length;
  const drawerList = React.useMemo(() => {
    let list = chapters.map((c, idx) => ({ c, idx }));
    if (drawerQuery.trim()) {
      const q = drawerQuery.trim().toLowerCase();
      list = list.filter(({ c }) => c.title.toLowerCase().includes(q));
    }
    if (drawerOrder === 'desc') list = list.slice().reverse();
    return list;
  }, [chapters, drawerOrder, drawerQuery]);

  if (!book) return null;

  const chapter = chapters[chapterIndex];
  const isNight = settings.theme === 'night';
  const hasBookmark = chapter ? bookmarks.some((b) => b.chapterId === chapter.id) : false;
  const progressPct = total > 0 ? Math.round(((chapterIndex + 1) / total) * 100) : 0;
  const paragraphs = (content || chapter?.content || '').split(/\n+/).filter((p) => p.trim().length > 0);

  const goToChapter = (idx: number) => {
    if (idx < 0 || idx >= total) return;
    setStatus('loading');
    setSettingsOpen(false);
    setDrawerOpen(false);
    setToolbarVisible(false);
    if (transitionRef.current) clearTimeout(transitionRef.current);
    transitionRef.current = setTimeout(() => {
      openChapter(bookId, idx);
      setStatus(chapters[idx]?.content ? 'ready' : 'error');
    }, 260);
  };

  return (
    <View style={[styles.container, { backgroundColor: display.theme.bg }]}>
      {status === 'ready' && (
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ padding: 24, paddingTop: 56, paddingBottom: 90 }}
          onScrollBeginDrag={() => setToolbarVisible(false)}>
          <Pressable onPress={toggleToolbar}>
            <Text style={[styles.chapterTitle, { fontSize: display.titleSize, color: display.theme.text }]}>
              {chapter?.title || book.title}
            </Text>
            <Text style={[styles.chapterMeta, { color: display.theme.sub }]}>
              {book.title} · {book.author}
            </Text>
            {paragraphs.length === 0 ? (
              <Text style={{ color: display.theme.sub, fontSize: 14 }}>本章暂无内容</Text>
            ) : (
              paragraphs.map((p, i) => (
                <Text
                  key={i}
                  style={{
                    fontFamily: 'serif',
                    fontSize: display.fontSize,
                    lineHeight: display.fontSize * display.lineHeight,
                    marginBottom: display.paraGap,
                    color: display.theme.text,
                    textAlign: 'justify',
                  }}>
                  {'　　' + p}
                </Text>
              ))
            )}
            <View style={[styles.endBlock, { borderTopColor: display.theme.hair }]}>
              <Text style={{ color: display.theme.sub, fontSize: 12 }}>本章完</Text>
              <Pressable
                onPress={() => goToChapter(chapterIndex + 1)}
                disabled={chapterIndex >= total - 1}
                style={[styles.nextBtn, { borderColor: display.theme.text, opacity: chapterIndex >= total - 1 ? 0.4 : 1 }]}>
                <Text style={{ color: display.theme.text, fontSize: 14, fontFamily: 'serif' }}>
                  {chapterIndex >= total - 1 ? '已是最新章节' : `下一章 · ${chapters[chapterIndex + 1]?.title}`}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </ScrollView>
      )}

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <View style={[styles.spinner, { borderColor: display.theme.hair, borderTopColor: display.theme.sub }]} />
          <Text style={{ color: display.theme.sub, fontSize: 13 }}>正在加载…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.centerFill, { paddingHorizontal: 40 }]}>
          <Icon name="error-outline" size={44} color={display.theme.sub} />
          <Text style={{ color: display.theme.text, fontSize: 15, fontWeight: '500', marginTop: 14, marginBottom: 8 }}>
            章节内容为空
          </Text>
          <Text style={{ color: display.theme.sub, fontSize: 12.5, lineHeight: 20, textAlign: 'center' }}>
            该章节没有解析到正文，可尝试重新打开或查看目录。
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Pressable onPress={() => goToChapter(chapterIndex)} style={[styles.retryBtn, { backgroundColor: '#2e6b5e' }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>重新加载</Text>
            </Pressable>
            <Pressable
              onPress={() => setDrawerOpen(true)}
              style={[styles.retryBtn, { borderWidth: 1, borderColor: display.theme.hair }]}>
              <Text style={{ color: display.theme.text, fontSize: 13 }}>返回目录</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.progressHint} pointerEvents="none">
        <Text style={{ color: display.theme.sub, fontSize: 10.5 }}>{chapterIndex + 1} / {total} · {progressPct}%</Text>
      </View>

      {isToolbarVisible && (
        <View style={[styles.topBar, { backgroundColor: display.chrome.bg, borderBottomColor: display.chrome.hair }]}>
          <Pressable onPress={() => navigation.navigate('BookDetail', { bookId })} style={styles.barBtn}>
            <Icon name="arrow-back" size={20} color={display.chrome.ink} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ color: display.chrome.ink, fontSize: 14, fontWeight: '600' }}>
              {book.title}
            </Text>
          </View>
          <Pressable
            onPress={() => Alert.alert('更多', '举报 / 分享功能开发中')}
            style={styles.barBtn}>
            <Icon name="more-horiz" size={20} color={display.chrome.ink} />
          </Pressable>
        </View>
      )}

      {isToolbarVisible && (
        <View style={[styles.bottomBar, { backgroundColor: display.chrome.bg, borderTopColor: display.chrome.hair }]}>
          <View style={styles.chapterNav}>
            <Pressable onPress={() => goToChapter(chapterIndex - 1)} disabled={chapterIndex <= 0}>
              <Text style={{ color: display.chrome.ink, fontSize: 12.5, opacity: chapterIndex <= 0 ? 0.4 : 1 }}>上一章</Text>
            </Pressable>
            <View style={[styles.sliderTrack, { backgroundColor: display.chrome.hair }]}>
              <View style={[styles.sliderFill, { width: `${progressPct}%` }]} />
              <View style={[styles.sliderThumb, { left: `${progressPct}%` }]} />
            </View>
            <Pressable onPress={() => goToChapter(chapterIndex + 1)} disabled={chapterIndex >= total - 1}>
              <Text style={{ color: display.chrome.ink, fontSize: 12.5, opacity: chapterIndex >= total - 1 ? 0.4 : 1 }}>下一章</Text>
            </Pressable>
          </View>
          <View style={styles.actionRow}>
            <ReaderAction icon="list-alt" label="目录" color={display.chrome.ink} onPress={() => { setDrawerOpen(true); setToolbarVisible(false); }} />
            <ReaderAction
              icon={hasBookmark ? 'bookmark' : 'bookmark-border'}
              label="书签"
              color={display.chrome.ink}
              onPress={() => chapter && toggleBookmark(bookId, chapter.id)}
            />
            <ReaderAction
              icon={isNight ? 'wb-sunny' : 'brightness-2'}
              label={isNight ? '日间' : '夜间'}
              color={display.chrome.ink}
              onPress={() => setReaderTheme(isNight ? 'paper' : 'night')}
            />
            <ReaderAction icon="tune" label="设置" color={display.chrome.ink} onPress={() => { setSettingsOpen(true); setToolbarVisible(false); }} />
          </View>
        </View>
      )}

      {settingsOpen && (
        <>
          <Pressable style={styles.overlay} onPress={() => setSettingsOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: display.chrome.sheetBg }]}>
            <View style={[styles.grabber, { backgroundColor: display.chrome.hair }]} />

            <View style={styles.brightnessRow}>
              <Icon name="brightness-6" size={18} color={display.chrome.sheetSub} />
              <View style={[styles.sliderTrack, { backgroundColor: display.chrome.hair, height: 5 }]}>
                <View style={[styles.sliderFill, { width: '55%', backgroundColor: '#c9a15e' }]} />
                <View style={[styles.sliderThumb, { left: '55%' }]} />
              </View>
            </View>

            <View style={styles.fontRow}>
              <Text style={{ color: display.chrome.sheetSub, fontSize: 12, width: 42 }}>字号</Text>
              <Pressable onPress={decFont} style={[styles.fontBtn, { borderColor: display.chrome.hair }]}>
                <Text style={{ color: display.chrome.sheetInk, fontSize: 15 }}>A−</Text>
              </Pressable>
              <View style={{ width: 30, alignItems: 'center' }}>
                <Text style={{ color: display.chrome.sheetInk, fontSize: 15, fontFamily: 'serif' }}>{display.fontSize}</Text>
              </View>
              <Pressable onPress={incFont} style={[styles.fontBtn, { borderColor: display.chrome.hair }]}>
                <Text style={{ color: display.chrome.sheetInk, fontSize: 19 }}>A+</Text>
              </Pressable>
            </View>

            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: display.chrome.sheetSub, fontSize: 12, marginBottom: 7 }}>行间距</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {LINE_LABELS.map((label, i) => {
                  const on = settings.lineHeightIndex === i;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setLineHeightIndex(i)}
                      style={[
                        styles.optBtn,
                        { backgroundColor: on ? '#2e6b5e' : 'transparent', borderColor: on ? '#2e6b5e' : display.chrome.hair },
                      ]}>
                      <Text style={{ color: on ? '#fff' : display.chrome.sheetInk, fontSize: 12 }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: display.chrome.sheetSub, fontSize: 12, marginBottom: 9 }}>阅读背景</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {THEME_ORDER.map((key) => {
                  const t = READER_THEMES[key];
                  const on = settings.theme === key;
                  return (
                    <Pressable key={key} onPress={() => setReaderTheme(key)} style={styles.themeItem}>
                      <View style={[styles.swatch, { backgroundColor: t.bg, borderColor: on ? '#2e6b5e' : display.chrome.hair }]}>
                        <Text style={{ color: t.text, fontFamily: 'serif', fontSize: 16 }}>文</Text>
                      </View>
                      <Text style={{ color: on ? '#2e6b5e' : display.chrome.sheetSub, fontSize: 11 }}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ color: display.chrome.sheetSub, fontSize: 12, marginBottom: 7 }}>翻页方式</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[{ key: 'scroll', label: '上下滚动' }, { key: 'page', label: '左右翻页' }].map((o) => {
                  const on = settings.pageMode === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setPageMode(o.key as 'scroll' | 'page')}
                      style={[
                        styles.optBtn,
                        { backgroundColor: on ? '#2e6b5e' : 'transparent', borderColor: on ? '#2e6b5e' : display.chrome.hair },
                      ]}>
                      <Text style={{ color: on ? '#fff' : display.chrome.sheetInk, fontSize: 12 }}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </>
      )}

      {drawerOpen && (
        <>
          <Pressable style={styles.overlay} onPress={() => setDrawerOpen(false)} />
          <View style={[styles.drawer, { backgroundColor: display.chrome.sheetBg }]}>
            <View style={{ padding: 18, paddingTop: 48, paddingBottom: 12 }}>
              <Text style={{ fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: display.chrome.sheetInk }}>
                {book.title}
              </Text>
              <Text style={{ color: display.chrome.sheetSub, fontSize: 12, marginTop: 3 }}>共 {total} 章</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <View style={[styles.drawerSearch, { backgroundColor: display.chrome.field }]}>
                  <Icon name="search" size={14} color={display.chrome.sheetSub} />
                  <TextInput
                    value={drawerQuery}
                    onChangeText={setDrawerQuery}
                    placeholder="搜索章节"
                    placeholderTextColor={display.chrome.sheetSub}
                    style={{ flex: 1, color: display.chrome.sheetInk, fontSize: 12, padding: 0, marginLeft: 7 }}
                  />
                </View>
                <Pressable
                  onPress={() => setDrawerOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  style={[styles.orderBtn, { borderColor: display.chrome.hair }]}>
                  <Icon name="swap-vert" size={14} color={display.chrome.sheetInk} />
                  <Text style={{ color: display.chrome.sheetInk, fontSize: 12 }}>{drawerOrder === 'asc' ? '正序' : '倒序'}</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 20 }}>
              {drawerList.map(({ c, idx }) => {
                const isCur = idx === chapterIndex;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => goToChapter(idx)}
                    style={[styles.chapterRow, { backgroundColor: isCur ? 'rgba(46,107,94,.1)' : 'transparent' }]}>
                    <Text style={{ color: isCur ? '#2e6b5e' : display.chrome.sheetSub, fontSize: 12, width: 34 }}>
                      {idx + 1}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, fontSize: 13.5, color: isCur ? '#2e6b5e' : display.chrome.sheetInk, fontWeight: isCur ? '700' : '400' }}>
                      {c.title}
                    </Text>
                    {isCur && <Text style={{ color: '#2e6b5e', fontSize: 10 }}>在读</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function ReaderAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionItem}>
      <Icon name={icon} size={21} color={color} />
      <Text style={{ color, fontSize: 11, marginTop: 5 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chapterTitle: { fontFamily: 'serif', fontWeight: '700', marginBottom: 8, lineHeight: 30 },
  chapterMeta: { fontSize: 12, marginBottom: 24 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  spinner: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  endBlock: { marginTop: 38, paddingTop: 20, borderTopWidth: 1, alignItems: 'center' },
  nextBtn: { marginTop: 16, paddingVertical: 11, paddingHorizontal: 28, borderRadius: 8, borderWidth: 1 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 8 },
  progressHint: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingBottom: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  barBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
  },
  chapterNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderTrack: { flex: 1, height: 4, borderRadius: 2, position: 'relative' },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#2e6b5e', borderRadius: 2 },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2e6b5e',
    transform: [{ translateX: -7 }, { translateY: -7 }],
  },
  actionRow: { flexDirection: 'row', marginTop: 14 },
  actionItem: { flex: 1, alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingTop: 8,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 12 },
  brightnessRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  fontRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  fontBtn: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  optBtn: { flex: 1, height: 36, borderWidth: 1, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  themeItem: { flex: 1, alignItems: 'center', gap: 6 },
  swatch: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '80%',
  },
  drawerSearch: { flex: 1, height: 34, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  orderBtn: { height: 34, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 1 },
});
