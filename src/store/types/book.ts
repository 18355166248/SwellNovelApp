/**
 * 书籍相关类型定义
 */

/** 在线书籍的来源信息：标识书源与其目录页地址，供章节正文懒加载定位。 */
export interface BookSourceRef {
  name: string; // 书源 id，例如 'bookshuku'
  bookUrl: string; // 该书的目录页 URL，例如 http://wap.bookshuku.org/read/160297.html
}

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
  // 存在则为网络书源书籍：本地 TXT 无此字段。章节正文按需从 source 抓取并缓存。
  source?: BookSourceRef;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  content: string; // 在线书未抓取时为空串，抓取后作为离线缓存
  order: number;
  wordCount?: number;
  contentVersion?: number; // 在线书正文解析版本：书源修复后可识别旧缓存并按需重拉。
  sourceUrl?: string; // 在线书：该章正文页的绝对 URL
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
