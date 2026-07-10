/**
 * 字体管理（原生 iOS / Android）。
 *
 * 系统预设直接用平台字体族。远程字体先下载到 App 缓存目录，再交给项目内原生模块
 * 注册到 React Native 字体管理器。Web 端由 fontManager.web.ts 覆盖（FontFace）。
 */
import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { FontDef } from '../../theme/fontCatalog';
import { extractZipEntryAsBase64 } from '../../utils/fontArchive';

const ready = new Set<string>();
const readyFamilies = new Map<string, string>();
const loading = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

type ReaderFontLoaderModule = {
  /** 返回原生实际注册的字体名；iOS 必须使用字体文件内的 PostScript 名称。 */
  registerFont(path: string, family: string): Promise<string | null>;
};

const nativeFontLoader = NativeModules.ReaderFontLoader as
  | ReaderFontLoaderModule
  | undefined;

function emit() {
  listeners.forEach(l => l());
}

async function downloadFontFile(
  url: string,
  destination: string,
): Promise<void> {
  const result = await RNFS.downloadFile({
    fromUrl: url,
    toFile: destination,
    background: true,
    discretionary: true,
  }).promise;
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`字体下载失败（HTTP ${result.statusCode}）`);
  }
}

async function extractFontFromZip(
  archivePath: string,
  entry: string,
  fontPath: string,
): Promise<void> {
  // RNFS 以 Base64 跨 JS/原生边界，fflate 只解出官方包内指定条目；完成后立即
  // 释放压缩包，避免同一字体在缓存中占双份空间。
  const archiveBase64 = await RNFS.readFile(archivePath, 'base64');
  const fontBase64 = extractZipEntryAsBase64(archiveBase64, entry);
  await RNFS.writeFile(fontPath, fontBase64, 'base64');
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

/** 下载、解压和原生注册视为一个不可并发的字体任务。 */
export function isAnyFontLoading(): boolean {
  // inflight 会在 loading 写入前同步建立，可拦住同一帧内对不同字体的连续点击。
  return inflight.size > 0 || loading.size > 0;
}

/** 当前应使用的字体族；系统档返回平台族（'system' 为 undefined=平台默认），
 *  远程字体未就绪时返回 undefined（调用方回退到默认字体）。 */
export function fontFamilyFor(def: FontDef): string | undefined {
  if (def.kind === 'system') {
    return def.system
      ? (Platform.select(def.system) as string | undefined)
      : undefined;
  }
  return ready.has(def.key)
    ? readyFamilies.get(def.key) ?? def.remote!.family
    : undefined;
}

export async function ensureFont(def: FontDef): Promise<void> {
  if (def.kind === 'system' || ready.has(def.key)) return;
  const pending = inflight.get(def.key);
  if (pending) return pending;
  if (inflight.size > 0) {
    throw new Error('已有字体正在下载，请稍候');
  }

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
      const extension = rf.fileExtension ?? 'ttf';
      const fontPath = `${fontDir}/${def.key}.${extension}`;
      await RNFS.mkdir(fontDir);
      if (!(await RNFS.exists(fontPath))) {
        if (rf.archiveEntry) {
          const archivePath = `${fontDir}/${def.key}.zip`;
          try {
            await downloadFontFile(rf.url, archivePath);
            await extractFontFromZip(
              archivePath,
              rf.archiveEntry,
              fontPath,
            );
          } catch (error) {
            await RNFS.unlink(fontPath).catch(() => {});
            throw error;
          } finally {
            await RNFS.unlink(archivePath).catch(() => {});
          }
        } else {
          try {
            await downloadFontFile(rf.url, fontPath);
          } catch (error) {
            await RNFS.unlink(fontPath).catch(() => {});
            throw error;
          }
        }
      }

      // 文件可能来自上一次启动；每次进程启动仍需重新注册到字体管理器。
      try {
        const registeredFamily = await nativeFontLoader.registerFont(
          fontPath,
          rf.family,
        );
        readyFamilies.set(def.key, registeredFamily || rf.family);
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
