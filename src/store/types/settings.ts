/**
 * 应用设置相关类型定义
 */

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto'; // 主题模式
  language: string; // 语言设置
  notificationsEnabled: boolean; // 是否启用通知
  autoBackup: boolean; // 是否自动备份
  cacheSize: number; // 缓存大小（字节）
}
