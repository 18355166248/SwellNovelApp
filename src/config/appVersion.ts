import packageJson from '../../package.json';

/** UI 与 Android 共用 package.json 版本；iOS 发布配置需在发布检查中校验一致。 */
export const APP_VERSION = packageJson.version;
