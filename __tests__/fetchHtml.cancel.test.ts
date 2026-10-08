import { fetchHtml } from '../src/services/http/fetchHtml';

afterEach(() => jest.restoreAllMocks());

it('取消代理请求后不再重试或回退直连', async () => {
  const controller = new AbortController();
  let requestSignal!: AbortSignal;
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation((_url, init) => {
      requestSignal = init!.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener('abort', () =>
          reject(new Error('transport cancelled')),
        );
      });
    });
  const pending = fetchHtml('https://example.com/chapter', 15000, {
    signal: controller.signal,
    preferLocalProxy: true,
    localProxyRetries: 3,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(requestSignal.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('响应体迟迟未读取完也能取消，不必等待字节解码', async () => {
  const controller = new AbortController();
  const arrayBuffer = jest.fn(() => new Promise<ArrayBuffer>(() => {}));
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: true, arrayBuffer } as unknown as Response);
  const pending = fetchHtml('http://127.0.0.1/chapter', 15000, {
    signal: controller.signal,
  });
  await Promise.resolve();
  expect(arrayBuffer).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
