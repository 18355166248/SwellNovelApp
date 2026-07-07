import { createLatestRequestTracker } from '../src/utils/latestRequest';

describe('latestRequest', () => {
  it('accepts only the most recently started request', () => {
    const tracker = createLatestRequestTracker();
    const first = tracker.start();
    const second = tracker.start();

    expect(tracker.isLatest(first)).toBe(false);
    expect(tracker.isLatest(second)).toBe(true);
  });

  it('invalidates all in-flight requests when reset', () => {
    const tracker = createLatestRequestTracker();
    const request = tracker.start();

    tracker.reset();

    expect(tracker.isLatest(request)).toBe(false);
  });
});
