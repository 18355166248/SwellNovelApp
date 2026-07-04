/**
 * 阅读统计原子状态。
 */
import { atom } from 'jotai';
import { ReadingStats, emptyReadingStats } from '../types/stats';

export const readingStatsAtom = atom<ReadingStats>(emptyReadingStats);
