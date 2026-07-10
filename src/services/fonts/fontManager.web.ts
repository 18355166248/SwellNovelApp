/// <reference lib="dom" />
/**
 * 字体管理（Web）。系统预设用 CSS 字体栈；远程字体用 FontFace API 运行时下载注册。
 */
import { FontDef } from '../../theme/fontCatalog';

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
      const face = new FontFace(rf.family, `url(${rf.url})`);
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
