const MAX_CHAPTER_CONTENT_LENGTH = 30000;

export function parseTxtChapters(bookId: string, content: string) {
  const chapters: Array<{
    id: string;
    bookId: string;
    title: string;
    content: string;
    order: number;
    wordCount?: number;
  }> = [];
  const titleRegex = /^(第[零一二三四五六七八九十百千两0-9]+[章节回卷])[：:\s]*([^\n]*)$/;
  let currentTitle = '开始';
  let buffer: string[] = [];
  let bufferLength = 0;
  let order = 0;
  let chunkPart = 1;

  const pushBufferedChapter = () => {
    const text = buffer.join('\n').trim();
    if (!text) {
      buffer = [];
      bufferLength = 0;
      return;
    }

    // iOS 上超大章节会触发整章断行、分页和隐藏 Text 测量，按固定字符数拆成虚拟章节避免打开 10MB TXT 时卡死。
    const title =
      chunkPart === 1 ? currentTitle : `${currentTitle}（续${chunkPart}）`;
    chapters.push({
      id: `${bookId}-${order}`,
      bookId,
      title,
      content: text,
      order,
      wordCount: text.length,
    });
    order += 1;
    chunkPart += 1;
    buffer = [];
    bufferLength = 0;
  };

  const appendContentLine = (line: string) => {
    if (
      bufferLength > 0 &&
      bufferLength + line.length + 1 > MAX_CHAPTER_CONTENT_LENGTH
    ) {
      pushBufferedChapter();
    }

    if (line.length > MAX_CHAPTER_CONTENT_LENGTH) {
      for (let i = 0; i < line.length; i += MAX_CHAPTER_CONTENT_LENGTH) {
        buffer.push(line.slice(i, i + MAX_CHAPTER_CONTENT_LENGTH));
        bufferLength += buffer[buffer.length - 1].length;
        pushBufferedChapter();
      }
      return;
    }

    buffer.push(line);
    bufferLength += line.length + 1;
    if (bufferLength >= MAX_CHAPTER_CONTENT_LENGTH) {
      pushBufferedChapter();
    }
  };

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (titleRegex.test(trimmed)) {
      pushBufferedChapter();
      const m = trimmed.match(titleRegex);
      currentTitle = m ? `${m[1]} ${m[2] || ''}`.trim() : trimmed;
      chunkPart = 1;
    } else {
      appendContentLine(line);
    }
  };

  // 避免 split('\n') 为 10MB+ 文件额外创建庞大的行数组，逐行扫描能显著降低导入峰值内存。
  let lineStart = 0;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '\n' || char === '\r') {
      consumeLine(content.slice(lineStart, i));
      if (char === '\r' && content[i + 1] === '\n') {
        i += 1;
      }
      lineStart = i + 1;
    }
  }
  if (lineStart < content.length) {
    consumeLine(content.slice(lineStart));
  }
  pushBufferedChapter();

  if (chapters.length === 0) {
    chapters.push({
      id: `${bookId}-0`,
      bookId,
      title: '正文',
      content: content.trim(),
      order: 0,
      wordCount: content.trim().length,
    });
  }
  return chapters;
}
