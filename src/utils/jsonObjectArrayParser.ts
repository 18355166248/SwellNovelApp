/** 按对象解析章节数组，避免等整本正文拼好后再一次性 JSON.parse。 */
export class JsonObjectArrayParser<T> {
  private state: 'start' | 'value' | 'object' | 'separator' | 'done' = 'start';
  private allowEnd = true;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private parts: string[] = [];
  private values: T[] = [];

  push(text: string): void {
    let partStart = this.state === 'object' ? 0 : -1;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (this.state === 'object') {
        // 正文里的括号、引号和反斜杠只属于字符串，不能误当成章节对象边界。
        if (this.inString) {
          if (this.escaped) this.escaped = false;
          else if (char === '\\') this.escaped = true;
          else if (char === '"') this.inString = false;
        } else if (char === '"') this.inString = true;
        else if (char === '{') this.depth++;
        else if (char === '}') {
          this.depth--;
          if (this.depth === 0) {
            this.parts.push(text.slice(partStart, i + 1));
            // 交给标准解析器校验每章语法，不能把损坏文件的半截目录发布到书架。
            this.values.push(JSON.parse(this.parts.join('')) as T);
            this.parts = [];
            partStart = -1;
            this.state = 'separator';
          }
        }
        continue;
      }
      if (char === ' ' || char === '\n' || char === '\r' || char === '\t')
        continue;
      if (this.state === 'start' && char === '[') this.state = 'value';
      else if (this.state === 'value' && char === '{') {
        this.state = 'object';
        this.depth = 1;
        partStart = i;
      } else if (this.state === 'value' && this.allowEnd && char === ']')
        this.state = 'done';
      else if (this.state === 'separator' && char === ',') {
        this.state = 'value';
        this.allowEnd = false;
      } else if (this.state === 'separator' && char === ']')
        this.state = 'done';
      else throw new SyntaxError('章节文件格式损坏');
    }
    if (partStart >= 0) this.parts.push(text.slice(partStart));
  }

  finish(): T[] {
    if (this.state !== 'done') throw new SyntaxError('章节文件尚未完整读取');
    return this.values;
  }
}
