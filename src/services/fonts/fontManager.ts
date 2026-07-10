/**
 * 字体管理（原生 iOS / Android）。
 *
 * 系统预设直接用平台字体族。远程字体先下载到 App 缓存目录，再交给项目内原生模块
 * 注册到 React Native 字体管理器。Web 端由 fontManager.web.ts 覆盖（FontFace）。
 */
import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { FontDef } from '../../theme/fontCatalog';

const ready = new Set<string>();
const loading = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

type ReaderFontLoaderModule = {
  registerFont(path: string, family: string): Promise<void>;
};

const nativeFontLoader = NativeModules.ReaderFontLoader as
  | ReaderFontLoaderModule
  | undefined;

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
  if (def.kind === 'system' || ready.has(def.key)) return;
  const pending = inflight.get(def.key);
  if (pending) return pending;

  const rf = def.remote!;
  // 放到微任务执行，确保任何同步失败发生前 inflight 已经写入；否则 finally
  // 先 delete、外层再 set，会留下一个永久 rejected 的脏任务。
  const task = Promise.resolve().then(async () => {
    loading.add(def.key);
    emit();
    try {
      if (!nativeFontLoader?.registerFont) {
        throw new Error('ReaderFontLoader 原生模块不可用，请重新构建 App');
      }

      const fontDir = `${RNFS.CachesDirectoryPath}/reader-fonts`;
      const fontPath = `${fontDir}/${def.key}.ttf`;
      await RNFS.mkdir(fontDir);
      if (!(await RNFS.exists(fontPath))) {
        const result = await RNFS.downloadFile({
          fromUrl: rf.url,
          toFile: fontPath,
          background: true,
          discretionary: true,
        }).promise;
        if (result.statusCode < 200 || result.statusCode >= 300) {
          await RNFS.unlink(fontPath).catch(() => {});
          throw new Error(`字体下载失败（HTTP ${result.statusCode}）`);
        }
      }

      // 文件可能来自上一次启动；每次进程启动仍需重新注册到字体管理器。
      try {
        await nativeFontLoader.registerFont(fontPath, rf.family);
      } catch (error) {
        // 缓存可能来自上次被中断的下载；注册失败即删除，下一次点击会重新下载，
        // 避免一个损坏文件让该字体永久不可用。
        await RNFS.unlink(fontPath).catch(() => {});
        throw error;
      }
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
