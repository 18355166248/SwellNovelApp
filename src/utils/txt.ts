export function parseTxtChapters(bookId: string, content: string) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const chapters: Array<{
    id: string;
    bookId: string;
    title: string;
    content: string;
    order: number;
    wordCount?: number;
  }> = [];
  const titleRegex = /^(第[零一二三四五六七八九十百千两\d]+[章节回卷])[：:\s]*([^\n]*)$/;
  let currentTitle = '开始';
  let buffer: string[] = [];
  let order = 0;
  for (const line of lines) {
    if (titleRegex.test(line.trim())) {
      if (buffer.length > 0) {
        const text = buffer.join('\n').trim();
        chapters.push({
          id: `${bookId}-${order}`,
          bookId,
          title: currentTitle,
          content: text,
          order,
          wordCount: text.length,
        });
        order += 1;
        buffer = [];
      }
      const m = line.trim().match(titleRegex);
      currentTitle = m ? `${m[1]} ${m[2] || ''}`.trim() : line.trim();
    } else {
      buffer.push(line);
    }
  }
  const remain = buffer.join('\n').trim();
  if (remain) {
    chapters.push({
      id: `${bookId}-${order}`,
      bookId,
      title: currentTitle,
      content: remain,
      order,
      wordCount: remain.length,
    });
  }
  if (chapters.length === 0) {
    chapters.push({
      id: `${bookId}-0`,
      bookId,
      title: '正文',
      content: normalized,
      order: 0,
      wordCount: normalized.length,
    });
  }
  return chapters;
}
