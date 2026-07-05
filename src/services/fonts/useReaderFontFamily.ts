/**
 * 阅读正文字体 hook：按阅读设置解析当前字体族，远程字体按需下载并在就绪后重渲染。
 * 远程字体加载期间回退到默认衬线字体，保证正文始终可读。
 */
import React from 'react';
import { useReaderSettings } from '../../store';
import { getFontDef } from '../../theme/fontCatalog';
import { SERIF_FONT } from '../../theme/fonts';
import { ensureFont, fontFamilyFor, subscribeFonts } from './fontManager';

export function useReaderFontFamily(): string {
  const settings = useReaderSettings();
  const def = getFontDef(settings.fontKey);
  const [, force] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => subscribeFonts(force), []);
  React.useEffect(() => {
    ensureFont(def).catch(() => {});
  }, [def]);

  // 远程字体未就绪时 fontFamilyFor 返回 undefined，回退到默认衬线字体。
  return fontFamilyFor(def) ?? (SERIF_FONT as string);
}
