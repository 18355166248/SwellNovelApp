import type { MetadataReport } from './enrichBookMetadata';

// Web/Node 的报告由内存查询接口和 onDiagnostic 回调提供；原生实现额外写入设备文件。
export function saveBookMetadataReports(_reports: MetadataReport[]): void {}
