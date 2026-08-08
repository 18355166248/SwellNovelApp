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
  finishedAt?: number; // 首次读到 100% 的时间，用于年度阅读记录
  progress: number; // 阅读进度 0-100
  currentChapterId?: string;
  totalChapters?: number;
  // 存在则为网络书源书籍：本地 TXT 无此字段。章节正文按需从 source 抓取并缓存。
  source?: BookSourceRef;
  // 在线书可选择追更；应用每天首次进入书架时自动检查一次，也保留手动检查入口。
  following?: boolean;
  lastUpdateCheckAt?: number;
  unreadUpdates?: number;
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
  nextPageUrl?: string; // 分页章节：下一正文子页 URL；为空表示当前章节已读完整。
  contentComplete?: boolean; // false 表示已缓存当前子页，但本章还有后续分页待按需加载。
}

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  position: number; // 在章节中的位置
  excerpt?: string; // 有摘抄正文时表示一条摘抄；普通书签不带此字段
  note?: string;
  createdAt: number;
}

export interface ReadingHistory {
  bookId: string;
  chapterId: string;
  position: number;
  updatedAt: number;
}
