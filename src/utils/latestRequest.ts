export type RequestToken = number;

export function createLatestRequestTracker() {
  let current = 0;

  return {
    start(): RequestToken {
      current += 1;
      return current;
    },
    reset() {
      current += 1;
    },
    isLatest(token: RequestToken): boolean {
      return token === current;
    },
  };
}
