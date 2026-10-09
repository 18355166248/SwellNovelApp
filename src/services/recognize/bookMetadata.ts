export interface BookMetadata {
  title?: string;
  author?: string;
  cover?: string;
  description?: string;
}

export interface MetadataLink {
  url: string;
  reason: string;
}

export interface MetadataExtraction extends BookMetadata {
  /** 页面明确提供的完整章节入口；详情页的最新章节不能直接当整本目录。 */
  catalogUrl?: string;
  metadataLinks: MetadataLink[];
  metadataRules: Partial<Record<keyof BookMetadata, string>>;
  metadataIssues: string[];
}

/**
 * DOM 注入和 HTML 回退共用此纯函数，新增规则只维护一处。
 * 构建工具从此函数生成静态 WebView 脚本；不能在 Hermes 上调用 toString() 获取函数源码。
 * 所有运行时依赖必须放在函数内部或由参数传入，修改后运行 generate:metadata-script。
 */
export function extractBookMetadata(
  html: string,
  pageUrl: string,
  URLImpl: typeof URL,
): MetadataExtraction {
  const decode = (value: string) =>
    value.replace(
      /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
      (_, entity: string) => {
        if (entity[0] === '#') {
          const code =
            entity[1].toLowerCase() === 'x'
              ? parseInt(entity.slice(2), 16)
              : parseInt(entity.slice(1), 10);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        }
        return (
          (
            {
              amp: '&',
              quot: '"',
              apos: "'",
              lt: '<',
              gt: '>',
              nbsp: ' ',
            } as Record<string, string>
          )[entity.toLowerCase()] || ''
        );
      },
    );
  const text = (value: string) =>
    decode(value.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  const attrs = (tag: string) => {
    const result: Record<string, string> = {};
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = re.exec(tag)))
      result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
    return result;
  };
  const absolute = (value: string) => {
    if (!value?.trim()) return '';
    try {
      const url = new URLImpl(value, pageUrl);
      if (/^https?:$/.test(url.protocol)) {
        url.hash = '';
        return url.href;
      }
    } catch {
      /* 非法地址不能阻断目录识别。 */
    }
    return '';
  };
  const normalizeTitle = (value: string) =>
    value
      .trim()
      .replace(/^[《〈「]|[》〉」]$/g, '')
      .replace(
        /(?:全文阅读|全文閱讀|章节列表|章節列表|最新章节|最新章節|txt下载|TXT下载|目录|目錄)$/,
        '',
      )
      .trim();
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const meta: Record<string, string> = {};
  for (const tag of clean.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const key = a.property || a.name;
    if (key && a.content) meta[key.toLowerCase()] = a.content.trim();
  }
  const result: MetadataExtraction = {
    metadataLinks: [],
    metadataRules: {},
    metadataIssues: [],
  };
  const put = (
    field: keyof BookMetadata,
    value: string | undefined,
    rule: string,
  ) => {
    if (
      field === 'cover' &&
      value &&
      /(?:no[_-]?(?:photo|cover)|placeholder|loading|logo)\./i.test(value)
    ) {
      if (!result.metadataIssues.includes('placeholder-cover'))
        result.metadataIssues.push('placeholder-cover');
      return;
    }
    if (value && !result[field]) {
      result[field] = value;
      result.metadataRules[field] = rule;
    }
  };
  put('title', meta['og:novel:book_name'], 'meta:book_name');
  put('author', meta['og:novel:author'] || meta.author, 'meta:author');
  put(
    'cover',
    meta['og:image'] ? absolute(meta['og:image']) : '',
    'meta:image',
  );
  put(
    'description',
    meta['og:description'] || meta.description,
    'meta:description',
  );

  // 只读取 Book 的结构化资料，不执行脚本，也不把推荐列表的任意图片当成本书封面。
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.slice(0, 30).forEach(item => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const types = Array.isArray(value['@type'])
      ? value['@type']
      : [value['@type']];
    if (types.includes('Book')) {
      const name = typeof value.name === 'string' ? value.name : '';
      if (result.title && normalizeTitle(result.title) !== normalizeTitle(name))
        return;
      put('title', name, 'jsonld:Book');
      const author = Array.isArray(value.author)
        ? value.author[0]
        : value.author;
      put(
        'author',
        typeof author === 'string' ? author : author?.name,
        'jsonld:Book',
      );
      const image = Array.isArray(value.image) ? value.image[0] : value.image;
      put(
        'cover',
        absolute(typeof image === 'string' ? image : image?.url || ''),
        'jsonld:Book',
      );
      put(
        'description',
        typeof value.description === 'string' ? value.description : '',
        'jsonld:Book',
      );
    }
    if (value['@graph']) visit(value['@graph'], depth + 1);
  };
  for (const script of html.match(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi,
  ) || []) {
    try {
      visit(
        JSON.parse(
          script.replace(/^<script[^>]*>/i, '').replace(/<\/script\s*>$/i, ''),
        ),
      );
    } catch {
      /* 畸形结构化数据继续走容器规则。 */
    }
  }
  const docTitle = text(
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1] || '',
  ).split(/[-_|]/)[0];
  const h1 = text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(clean)?.[1] || '');
  put('title', normalizeTitle(h1 || docTitle), 'heading/title');
  const plain = text(clean);
  put(
    'author',
    /作者\s*[：:]\s*([^\s，。|]{1,20})/.exec(plain)?.[1],
    'label:author',
  );

  const stack: Array<{ tag: string; marker: string }> = [];
  for (const tag of clean.match(/<\/?[a-z][^>]*>/gi) || []) {
    const name = /^<\/?([\w-]+)/.exec(tag)?.[1].toLowerCase() || '';
    if (/^<\//.test(tag)) {
      for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].tag === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const a = attrs(tag);
    if (name === 'img' && !result.cover) {
      const context = stack.map(node => node.marker).join(' ');
      const explicit =
        /(?:^|\s)(?:bookdetail|cover|book-cover|fmimg|block_img2)(?:\s|$)/i.test(
          context,
        ) || a.itemprop === 'image';
      const named =
        !!result.title &&
        normalizeTitle(a.alt || '') === normalizeTitle(result.title);
      const src = a['data-original'] || a['data-src'] || a.src || '';
      if (explicit || named)
        put(
          'cover',
          absolute(src),
          explicit ? 'image:book-container' : 'image:title-alt',
        );
    }
    if (
      !/^(?:img|meta|link|br|hr|input|source|area|base|embed|wbr)$/.test(
        name,
      ) &&
      !/\/>$/.test(tag)
    )
      stack.push({ tag: name, marker: `${a.class || ''} ${a.id || ''}` });
  }
  const addLink = (href: string, reason: string) => {
    const url = absolute(href);
    if (
      url &&
      url !== absolute(pageUrl) &&
      !result.metadataLinks.some(link => link.url === url) &&
      result.metadataLinks.length < 12
    )
      result.metadataLinks.push({ url, reason });
  };
  for (const tag of clean.match(/<link\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    if (a.rel === 'canonical') addLink(a.href, 'canonical');
  }
  const links = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let link;
  while ((link = links.exec(clean))) {
    const a = attrs(link[1]);
    const label = text(link[2]);
    if (
      /^(?:查看|进入|進入|全部|完整)?(?:章节|章節)?(?:目录|目錄|章节列表|章節列表)$/.test(
        label,
      )
    ) {
      const target = absolute(a.href);
      // 通用入口只跟随同站显式目录；跨站广告不能借“目录”文案获得抓取权限。
      if (
        target &&
        new URLImpl(target).origin === new URLImpl(pageUrl).origin &&
        target !== absolute(pageUrl)
      )
        result.catalogUrl = result.catalogUrl || target;
    }
    if (
      /^(?:返回)?(?:书籍|書籍|本书|本書)?(?:详情|詳情|信息|资料|資料|介绍|介紹|书页|書頁)$/.test(
        label,
      ) ||
      (!!result.title && normalizeTitle(label) === normalizeTitle(result.title))
    )
      addLink(a.href, 'book-link');
  }
  return result;
}
