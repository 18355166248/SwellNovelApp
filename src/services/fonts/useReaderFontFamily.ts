/**
 * 阅读正文字体 hook：按阅读设置解析当前字体族，远程字体按需下载并在就绪后重渲染。
 * 远程字体加载期间回退到默认衬线字体，保证正文始终可读。
 */
import React from 'react';
import { useReaderSettings } from '../../store';
import { getFontDef } from '../../theme/fontCatalog';
import { SERIF_FONT } from '../../theme/fonts';
import { ensureFont, fontFamilyFor, subscribeFonts } from './fontManager';

export function useReaderFontFamily(): string | undefined {
  const settings = useReaderSettings();
  const def = getFontDef(settings.fontKey);
  const [, force] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => subscribeFonts(force), []);
  React.useEffect(() => {
    ensureFont(def).catch(() => {});
  }, [def]);

  const family = fontFamilyFor(def);
  // system 档的 undefined 表示真正使用平台默认字体，不能再回退到宋体；
  // 只有远程字体下载/注册期间才临时使用宋体，避免正文闪成空白。
  return def.kind === 'system' ? family : family ?? (SERIF_FONT as string);
}
