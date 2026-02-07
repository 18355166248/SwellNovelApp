/**
 * 阅读器相关类型定义
 */

export interface ReaderSettings {
  fontSize: number; // 字体大小
  lineHeight: number; // 行高倍数
  paragraphSpacing: number; // 段间距
  backgroundColor: string; // 背景颜色
  textColor: string; // 文字颜色
  fontFamily?: string; // 字体类型
  pageTurnAnimation: 'slide' | 'scroll' | 'none'; // 翻页动画
  brightness: number; // 屏幕亮度 0-1
}

export interface ReaderState {
  currentBookId: string | null;
  currentChapterId: string | null;
  scrollPosition: number; // 滚动位置
  isToolbarVisible: boolean; // 工具栏是否显示
  isFullScreen: boolean; // 是否全屏
}
