/**
 * 仅开发期输出的诊断日志。
 *
 * 书源抓取链路每抓一页都会打一串 info 日志。在 Release 包里这些调用仍会执行,并经
 * RN bridge 落到原生 console,属于热路径上的无谓开销。用 __DEV__ 门控:开发期照常输出,
 * 生产期退化成空函数(仅省去 bridge 往返,真正的错误仍走 console.warn/error)。
 */
export const devInfo: (...args: unknown[]) => void =
  typeof __DEV__ !== 'undefined' && __DEV__
    ? (...args) => console.info(...args)
    : () => {};
