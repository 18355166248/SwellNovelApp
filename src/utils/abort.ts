export function abortError(): Error {
  const error = new Error('操作已取消');
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** 即使原生读取/第三方解析不响应 signal，也立即停止上层等待和后续处理。 */
export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(abortError());
    };
    signal.addEventListener('abort', cancel);
    promise.then(
      value => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) reject(abortError());
        else resolve(value);
      },
      error => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
    if (signal.aborted) cancel();
  });
}

/** 将页面取消与单次请求超时控制器连接，返回监听清理函数。 */
export function forwardAbort(
  signal: AbortSignal | undefined,
  controller: AbortController,
) {
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort);
  return () => signal?.removeEventListener('abort', abort);
}

interface SharedRequest<T> {
  controller: AbortController;
  promise: Promise<T>;
  users: number;
}

export function createSharedRequestPool<T>() {
  const requests = new Map<string, SharedRequest<T>>();
  return (
    key: string,
    signal: AbortSignal | undefined,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    throwIfAborted(signal);
    let entry = requests.get(key);
    if (!entry) {
      const controller = new AbortController();
      const promise = Promise.resolve().then(() => {
        throwIfAborted(controller.signal);
        return task(controller.signal);
      });
      entry = { controller, promise, users: 0 };
      requests.set(key, entry);
      const current = entry;
      const clear = () => {
        if (requests.get(key) === current) requests.delete(key);
      };
      promise.then(clear, clear);
    }
    const current = entry;
    current.users += 1;
    return new Promise<T>((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return false;
        active = false;
        signal?.removeEventListener('abort', cancel);
        current.users -= 1;
        return true;
      };
      const cancel = () => {
        if (!release()) return;
        // 预取和前台可共享请求；只有最后一个使用者离开才取消底层，避免互相误杀。
        if (current.users === 0) {
          if (requests.get(key) === current) requests.delete(key);
          current.controller.abort();
        }
        reject(abortError());
      };
      signal?.addEventListener('abort', cancel);
      current.promise.then(
        value => {
          if (release()) resolve(value);
        },
        error => {
          if (release()) reject(error);
        },
      );
    });
  };
}
