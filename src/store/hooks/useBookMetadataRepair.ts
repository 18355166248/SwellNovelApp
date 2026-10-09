import React from 'react';
import { useStore } from 'jotai';
import { booksAtom } from '../atoms';
import {
  enrichBookMetadata,
  mergeBookMetadata,
  needsBookMetadata,
} from '../../services/recognize/enrichBookMetadata';

/** 旧版已入库书籍打开详情时也能补资料；不重导目录，不触碰章节、书签和阅读位置。 */
export function useBookMetadataRepair(
  bookId: string,
  focused: boolean,
  signal: AbortSignal,
) {
  const store = useStore();
  React.useEffect(() => {
    const book = store.get(booksAtom).find(item => item.id === bookId);
    const url = book?.source?.bookUrl;
    if (!focused || !book || !url || !needsBookMetadata(book)) return;
    let active = true;
    enrichBookMetadata(
      { ...book, ok: true, isDetail: true, url, host: '', chapters: [] },
      { signal },
    )
      .then(({ book: metadata }) => {
        if (!active || signal.aborted) return;
        // 等待网络期间读者可能更新进度或删书，必须以最新书籍合并，不能写回旧快照或复活已删的书。
        store.set(booksAtom, books =>
          books.map(current =>
            current.id === bookId
              ? mergeBookMetadata(current, metadata)
              : current,
          ),
        );
      })
      .catch(() => {
        /* 补资料是非阻塞任务；用户离开或网络失败均保留现有书籍。 */
      });
    return () => {
      active = false;
    };
  }, [bookId, focused, signal, store]);
}
