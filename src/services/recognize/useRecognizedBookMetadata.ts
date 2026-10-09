import React from 'react';
import type { RecognizedBook } from './recognizer';
import {
  enrichBookMetadata,
  mergeBookMetadata,
  needsBookMetadata,
} from './enrichBookMetadata';

/** 浏览器预览和入库使用同一份补全资料；目录自动重发不能覆盖封面，也不能反复触发网络。 */
export function useRecognizedBookMetadata(
  input: RecognizedBook | null,
  focused: boolean,
) {
  const key = input
    ? JSON.stringify([
        input.url,
        input.title,
        input.author,
        input.cover,
        input.description,
        input.metadataLinks,
      ])
    : '';
  const latestInput = React.useRef(input);
  latestInput.current = input;
  const [result, setResult] = React.useState<{
    key: string;
    book: RecognizedBook;
  } | null>(null);
  const latestResult = React.useRef(result);
  latestResult.current = result;
  React.useEffect(() => {
    const original = latestInput.current;
    if (!original) {
      setResult(null);
      return;
    }
    if (
      !focused ||
      !original ||
      !needsBookMetadata(original) ||
      latestResult.current?.key === key
    )
      return;
    const controller = new AbortController();
    enrichBookMetadata(original, { signal: controller.signal })
      .then(({ book }) => {
        if (!controller.signal.aborted) setResult({ key, book });
      })
      .catch(() => {
        // 网络失败仍显示已有目录；切站/失焦取消的响应不能回填下一本书的卡片。
        if (!controller.signal.aborted) setResult({ key, book: original });
      });
    return () => controller.abort();
  }, [key, focused]);
  const ready = result?.key === key;
  return {
    // 补全只合并资料，保留最新收到的章节及分页链接，避免异步响应写回旧目录。
    book:
      input && ready
        ? {
            ...mergeBookMetadata(input, result.book),
            metadataIssues: result.book.metadataIssues,
            metadataChecked: true,
          }
        : input,
    loading: !!input && focused && needsBookMetadata(input) && !ready,
  };
}
