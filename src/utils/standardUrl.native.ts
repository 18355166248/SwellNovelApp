// RN 自带 URL 的相对路径与 hash 语义不完整，目录解析和页面身份校验使用标准实现。
// 显式导出而不覆盖 global.URL，避免扩大到其他现有网络逻辑。
export { URL as StandardURL } from 'react-native-url-polyfill';
