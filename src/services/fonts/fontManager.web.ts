/// <reference lib="dom" />
/**
 * 字体管理（Web）。系统预设用 CSS 字体栈；远程字体用 FontFace API 运行时下载注册。
 */
import { FontDef } from '../../theme/fontCatalog';
import { extractZipEntry } from '../../utils/fontArchive';

const ready = new Set<string>();
const loading = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function subscribeFonts(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isFontReady(key: string): boolean {
  return ready.has(key);
}

export function isFontLoading(key: string): boolean {
  return loading.has(key);
}

export function isAnyFontLoading(): boolean {
  return inflight.size > 0 || loading.size > 0;
}

export function fontFamilyFor(def: FontDef): string | undefined {
  if (def.kind === 'system') return def.system?.web;
  return ready.has(def.key) ? def.remote!.family : undefined;
}

export async function ensureFont(def: FontDef): Promise<void> {
  if (def.kind === 'system' || ready.has(def.key)) return;
  const pending = inflight.get(def.key);
  if (pending) return pending;
  if (inflight.size > 0) {
    throw new Error('已有字体正在下载，请稍候');
  }
  if (typeof (globalThis as any).FontFace === 'undefined') return;
  const rf = def.remote!;
  const task = Promise.resolve().then(async () => {
    loading.add(def.key);
    emit();
    try {
      let source: string | ArrayBuffer = `url(${rf.url})`;
      if (rf.archiveEntry) {
        // FontFace 无法直接读取 ZIP；Web 与原生保持一致，先下载官方包并只解出
        // 指定字体条目，再把 ArrayBuffer 交给浏览器字体引擎。
        const response = await fetch(rf.url);
        if (!response.ok) {
          throw new Error(`字体下载失败（HTTP ${response.status}）`);
        }
        const fontBytes = extractZipEntry(
          new Uint8Array(await response.arrayBuffer()),
          rf.archiveEntry,
        );
        source = Uint8Array.from(fontBytes).buffer;
      }
      const face = new FontFace(rf.family, source);
      await face.load();
      (document as any).fonts.add(face);
      ready.add(def.key);
    } finally {
      loading.delete(def.key);
      inflight.delete(def.key);
      emit();
    }
  });
  inflight.set(def.key, task);
  return task;
}
