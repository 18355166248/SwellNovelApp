/**
 * 字体管理（原生 iOS / Android）。
 *
 * 系统预设直接用平台字体族。远程字体运行时下载 + 注册：懒加载 expo-font（其
 * loadAsync 支持远程 URI 运行时加载，兼容新架构）。未安装/未链接原生模块时优雅降级
 * —— 远程字体不可用，系统预设照常工作。Web 端由 fontManager.web.ts 覆盖（FontFace）。
 */
import { Platform } from 'react-native';
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

/** 当前应使用的字体族；系统档返回平台族（'system' 为 undefined=平台默认），
 *  远程字体未就绪时返回 undefined（调用方回退到默认字体）。 */
export function fontFamilyFor(def: FontDef): string | undefined {
  if (def.kind === 'system') {
    return def.system
      ? (Platform.select(def.system) as string | undefined)
      : undefined;
  }
  return ready.has(def.key) ? def.remote!.family : undefined;
}

export async function ensureFont(def: FontDef): Promise<void> {
  if (def.kind === 'system' || ready.has(def.key) || loading.has(def.key)) {
    return;
  }
  const rf = def.remote!;
  loading.add(def.key);
  emit();
  try {
    let ExpoFont: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ExpoFont = require('expo-font');
    } catch {
      ExpoFont = null;
    }
    if (!ExpoFont?.loadAsync) {
      throw new Error('expo-font 不可用（需安装并重新构建 App）');
    }
    await ExpoFont.loadAsync({ [rf.family]: rf.url });
    ready.add(def.key);
  } finally {
    loading.delete(def.key);
    emit();
  }
}
