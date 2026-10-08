import { JsonObjectArrayParser } from '../src/utils/jsonObjectArrayParser';

it('任意字符边界切块均与标准 JSON 解析一致，括号和转义不能误切章', () => {
  const text = JSON.stringify([
    { id: 'a', content: '正文\\"},[😀\n', nested: { a: [{ b: 1 }] } },
    { id: 'b', title: '第二章' },
  ]);
  for (let boundary = 0; boundary <= text.length; boundary++) {
    const parser = new JsonObjectArrayParser();
    parser.push(text.slice(0, boundary));
    parser.push(text.slice(boundary));
    expect(parser.finish()).toEqual(JSON.parse(text));
  }
  const parser = new JsonObjectArrayParser();
  for (const char of text) parser.push(char);
  expect(parser.finish()).toEqual(JSON.parse(text));
});

it.each(['[]', ' \n[ {} , {"a":true} ]\t'])('允许空目录和合法空白 %s', text => {
  const parser = new JsonObjectArrayParser();
  parser.push(text);
  expect(parser.finish()).toEqual(JSON.parse(text));
});

it.each([
  '',
  '[',
  '[{}',
  '[{},]',
  '[{} {}]',
  '[{}]x',
  '{}',
  '[1]',
  '[{"a":undefined}]',
  '[{"a":"x}]',
])('拒绝损坏目录，不返回部分结果 %s', text => {
  const parser = new JsonObjectArrayParser();
  expect(() => {
    parser.push(text);
    parser.finish();
  }).toThrow();
});
