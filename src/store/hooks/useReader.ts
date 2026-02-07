/**
 * 阅读器相关的自定义 Hooks
 */

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  readerSettingsAtom,
  readerStateAtom,
  currentChapterContentAtom,
  currentChapterIndexAtom,
  isLoadingChapterAtom,
} from '../atoms';
import { ReaderSettings, ReaderState } from '../types/reader';

/**
 * 获取阅读设置
 */
export const useReaderSettings = () => {
  return useAtomValue(readerSettingsAtom);
};

/**
 * 更新阅读设置
 */
export const useUpdateReaderSettings = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  
  return (updates: Partial<ReaderSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };
};

/**
 * 重置阅读设置为默认值
 */
export const useResetReaderSettings = () => {
  const setSettings = useSetAtom(readerSettingsAtom);
  
  return () => {
    setSettings({
      fontSize: 16,
      lineHeight: 1.8,
      paragraphSpacing: 8,
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      pageTurnAnimation: 'slide',
      brightness: 1.0,
    });
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
