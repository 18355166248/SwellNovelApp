import RNFS from 'react-native-fs';
import type { MetadataReport } from './enrichBookMetadata';

const directory = `${RNFS.DocumentDirectoryPath}/diagnostics`;
let pending: Promise<void> = Promise.resolve();

/** 固定路径仅存最近 20 次资料解析报告，不保存网页源码、正文或书架快照。 */
export function saveBookMetadataReports(reports: MetadataReport[]): void {
  const json = JSON.stringify({ version: 1, reports }, null, 2);
  // 多本书同时补资料时串行写入，防止较早的报告迟到覆盖新结果。
  pending = pending
    .catch(() => {})
    .then(async () => {
      await RNFS.mkdir(directory);
      await RNFS.writeFile(`${directory}/book-metadata.json`, json, 'utf8');
    })
    .catch(error =>
      console.warn('[BookMetadata] save diagnostic failed', error),
    );
}
