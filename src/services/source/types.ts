/**
 * 网络书源框架的公共类型。
 *
 * 一个 BookSource 负责把某个小说网站的“详情页 / 目录页 / 正文页”解析成 App
 * 统一的书籍与章节结构。解析器只处理 HTML 字符串（无 DOM 依赖），取 HTML 的
 * 平台差异（原生直连 / Web 走代理）交由 services/http/fetchHtml 处理。
 */

/** 详情页解析结果。 */
export interface ParsedBookInfo {
  sourceBookId: string; // 站内书籍 id，例如 '160297'
  title: string;
  author: string;
  cover?: string;
  description?: string;
  status?: string; // 连载中 / 已完结
  catalogUrl: string; // 完整目录页 URL
}

/** 目录里的单章：标题 + 正文页绝对 URL。 */
export interface ParsedChapter {
  title: string;
  url: string;
}

/** 单章正文解析结果：兼容只返回正文的旧书源，也允许书源顺带回传页面真实章节名。 */
export type ParsedChapterContent =
  | string
  | {
      content: string;
      title?: string;
      nextPageUrl?: string;
      complete?: boolean;
      /** 书源已用正文容器、页码和章节导航确认这是合法短章，而非广告/拦截页。 */
      trustedShort?: boolean;
    };

export interface ParseChapterOptions {
  /** 当前阅读正文用 high，后台目录标题补全用 low，避免后台任务阻塞用户点击。 */
  priority?: 'high' | 'normal' | 'low';
}

export interface BookSource {
  id: string; // 书源标识，用作 bookId 前缀，例如 'bookshuku'
  name: string; // 展示名，例如 'TXT图书下载网'
  host: string; // 主机名，例如 'wap.bookshuku.org'
  /** 判断某个 URL 是否属于本书源。 */
  matchUrl(url: string): boolean;
  /** 从任意站内 URL（详情/目录/正文页）提取站内书籍 id；取不到返回 undefined。 */
  extractId(url: string): string | undefined;
  /** 由站内书籍 id 拼出详情页 URL（供搜索结果规范化到详情页）。 */
  detailUrl(id: string): string;
  /** 解析详情页（也兼容传入目录页/正文页 URL，只要能取到书籍 id）。 */
  parseBookInfo(url: string): Promise<ParsedBookInfo>;
  /** 解析完整目录，返回按顺序排列的章节列表。 */
  parseCatalog(info: ParsedBookInfo): Promise<ParsedChapter[]>;
  /** 解析单章正文，返回纯文本（段落以换行分隔），可附带页面真实章节名。 */
  parseChapterContent(
    url: string,
    options?: ParseChapterOptions,
  ): Promise<ParsedChapterContent>;
}
