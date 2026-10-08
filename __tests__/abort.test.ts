import { abortable, createSharedRequestPool } from '../src/utils/abort';

it('即使底层任务没有完成，取消也立即结束等待', async () => {
  const controller = new AbortController();
  const pending = abortable(new Promise(() => {}), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

it('共享请求保留仍在使用的订阅者，最后一人离开才停止并允许重新请求', async () => {
  const pool = createSharedRequestPool<string>();
  const first = new AbortController();
  const second = new AbortController();
  let sourceSignal!: AbortSignal;
  let finish!: (result: string) => void;
  const task = jest.fn((signal: AbortSignal) => {
    sourceSignal = signal;
    return new Promise<string>(resolve => {
      finish = resolve;
    });
  });
  const a = pool('chapter', first.signal, task);
  const b = pool('chapter', second.signal, task);
  await Promise.resolve();
  first.abort();
  await expect(a).rejects.toMatchObject({ name: 'AbortError' });
  expect(sourceSignal.aborted).toBe(false);
  second.abort();
  await expect(b).rejects.toMatchObject({ name: 'AbortError' });
  expect(sourceSignal.aborted).toBe(true);
  await expect(pool('chapter', undefined, async () => '新请求')).resolves.toBe(
    '新请求',
  );
  finish('旧请求');
  expect(task).toHaveBeenCalledTimes(1);
});
