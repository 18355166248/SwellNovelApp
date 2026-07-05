/// <reference lib="dom" />
/**
 * 字体管理（Web）。系统预设用 CSS 字体栈；远程字体用 FontFace API 运行时下载注册。
 */
import { FontDef } from '../../theme/fontCatalog';

const ready = new Set<string>();
const loading = new Set<string>();
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

export function fontFamilyFor(def: FontDef): string | undefined {
  if (def.kind === 'system') return def.system?.web;
  return ready.has(def.key) ? def.remote!.family : undefined;
}

export async function ensureFont(def: FontDef): Promise<void> {
  if (def.kind === 'system' || ready.has(def.key) || loading.has(def.key)) {
    return;
  }
  if (typeof (globalThis as any).FontFace === 'undefined') return;
  const rf = def.remote!;
  loading.add(def.key);
  emit();
  try {
    const face = new FontFace(rf.family, `url(${rf.url})`);
    await face.load();
    (document as any).fonts.add(face);
    ready.add(def.key);
  } finally {
    loading.delete(def.key);
    emit();
  }
}
