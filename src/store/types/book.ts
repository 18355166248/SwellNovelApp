/**
 * 书籍相关类型定义
 */

export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  description?: string;
  filePath?: string;
  fileFormat?: 'txt' | 'epub' | 'mobi';
  addedAt: number;
  updatedAt: number;
  lastReadAt?: number;
  progress: number; // 阅读进度 0-100
  currentChapterId?: string;
  totalChapters?: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  content: string;
  order: number;
  wordCount?: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  position: number; // 在章节中的位置
  note?: string;
  createdAt: number;
}

export interface ReadingHistory {
  bookId: string;
  chapterId: string;
  position: number;
  updatedAt: number;
}
