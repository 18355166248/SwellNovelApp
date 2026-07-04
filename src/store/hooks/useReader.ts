/**
 * 阅读器相关的自定义 Hooks
 */

import { useAtomValue, useSetAtom } from 'jotai';
import {
  readerSettingsAtom,
  readerStateAtom,
  readerDisplayAtom,
  currentChapterContentAtom,
  currentChapterIndexAtom,
  isLoadingChapterAtom,
} from '../atoms';
import { ReaderState } from '../types/reader';
import { ReaderThemeKey, FONT_SIZES, LINE_HEIGHTS } from '../../theme/readerThemes';

/**
 * 获取阅读设置
 */
export const useReaderSettings = () => {
  return useAtomValue(readerSettingsAtom);
};

/**
 * 获取派生的阅读展示 token（配色、字号、行高）
 */
export const useReaderDisplay = () => {
  return useAtomValue(readerDisplayAtom);
};

/**
 * 切换阅读背景主题（米白/浅灰/护眼/夜间）
 */
export const useSetReaderTheme = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  return (theme: ReaderThemeKey) => {
    setSettings((prev) => ({ ...prev, theme }));
  };
};

/**
 * 增大 / 减小字号
 */
export const useAdjustFontSize = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  return {
    inc: () =>
      setSettings((prev) => ({
        ...prev,
        fontSizeIndex: Math.min(FONT_SIZES.length - 1, prev.fontSizeIndex + 1),
      })),
    dec: () =>
      setSettings((prev) => ({
        ...prev,
        fontSizeIndex: Math.max(0, prev.fontSizeIndex - 1),
      })),
  };
};

/**
 * 设置行间距档位
 */
export const useSetLineHeightIndex = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  return (index: number) => {
    setSettings((prev) => ({
      ...prev,
      lineHeightIndex: Math.max(0, Math.min(LINE_HEIGHTS.length - 1, index)),
    }));
  };
};

/**
 * 设置翻页方式
 */
export const useSetPageMode = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  return (pageMode: 'scroll' | 'page') => {
    setSettings((prev) => ({ ...prev, pageMode }));
  };
};

/**
 * 设置阅读亮度（0..1）。仅原生端实际改屏幕亮度，值会持久化用于下次续用。
 */
export const useSetBrightness = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  return (brightness: number) => {
    setSettings((prev) => ({
      ...prev,
      brightness: Math.max(0, Math.min(1, brightness)),
    }));
  };
};

/**
 * 获取阅读器状态
 */
export const useReaderState = () => {
  return useAtomValue(readerStateAtom);
};

/**
 * 更新阅读器状态
 */
export const useUpdateReaderState = () => {
  const setState = useSetAtom(readerStateAtom);

  return (updates: Partial<ReaderState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };
};

/**
 * 切换工具栏显示/隐藏
 */
export const useToggleToolbar = () => {
  const setState = useSetAtom(readerStateAtom);

  return () => {
    setState((prev) => ({
      ...prev,
      isToolbarVisible: !prev.isToolbarVisible,
    }));
  };
};

/**
 * 设置工具栏可见性
 */
export const useSetToolbarVisible = () => {
  const setState = useSetAtom(readerStateAtom);

  return (visible: boolean) => {
    setState((prev) => ({ ...prev, isToolbarVisible: visible }));
  };
};

/**
 * 获取当前章节内容
 */
export const useCurrentChapterContent = () => {
  return useAtomValue(currentChapterContentAtom);
};

/**
 * 设置当前章节内容
 */
export const useSetChapterContent = () => {
  const setContent = useSetAtom(currentChapterContentAtom);

  return (content: string) => {
    setContent(content);
  };
};

/**
 * 获取当前章节索引
 */
export const useCurrentChapterIndex = () => {
  return useAtomValue(currentChapterIndexAtom);
};

/**
 * 设置当前章节索引
 */
export const useSetChapterIndex = () => {
  const setIndex = useSetAtom(currentChapterIndexAtom);

  return (index: number | null) => {
    setIndex(index);
  };
};

/**
 * 获取章节加载状态
 */
export const useIsLoadingChapter = () => {
  return useAtomValue(isLoadingChapterAtom);
};

/**
 * 设置章节加载状态
 */
export const useSetLoadingChapter = () => {
  const setIsLoading = useSetAtom(isLoadingChapterAtom);

  return (loading: boolean) => {
    setIsLoading(loading);
  };
};
