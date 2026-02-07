/**
 * 阅读器相关的原子状态
 */

import { atom } from 'jotai';
import { ReaderSettings, ReaderState } from '../types/reader';

// 默认阅读设置
const defaultReaderSettings: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.8,
  paragraphSpacing: 8,
  backgroundColor: '#FFFFFF',
  textColor: '#000000',
  pageTurnAnimation: 'slide',
  brightness: 1.0,
};

// 深色模式默认阅读设置
const darkReaderSettings: ReaderSettings = {
  ...defaultReaderSettings,
  backgroundColor: '#000000',
  textColor: '#FFFFFF',
};

// 阅读设置
export const readerSettingsAtom = atom<ReaderSettings>(defaultReaderSettings);

// 阅读器状态
export const readerStateAtom = atom<ReaderState>({
  currentBookId: null,
  currentChapterId: null,
  scrollPosition: 0,
  isToolbarVisible: false,
  isFullScreen: false,
});

// 当前章节内容
export const currentChapterContentAtom = atom<string>('');

// 当前章节索引
export const currentChapterIndexAtom = atom<number | null>(null);

// 是否正在加载章节
export const isLoadingChapterAtom = atom<boolean>(false);
