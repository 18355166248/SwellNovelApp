/** 空格、书名号和全角输入不应导致同一书名/作者漏搜。 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s《》「」『』“”"']/g, '');
}
