// 详情页与目录弹层共用方案 1 的色板，避免两处入口进入后出现底色跳变。
export function detailPalette(dark: boolean) {
  return {
    paper: dark ? '#171d1c' : '#ebe8e0',
    surface: dark ? '#252d2a' : '#ffffff',
    ink: dark ? '#f0ede5' : '#252c28',
    secondary: dark ? '#a8b4ac' : '#767d73',
    line: dark ? '#35433c' : '#d9ddd5',
    accent: dark ? '#89b8a1' : '#2e6b5e',
    destructive: dark ? '#ffb8b0' : '#aa4439',
  };
}
