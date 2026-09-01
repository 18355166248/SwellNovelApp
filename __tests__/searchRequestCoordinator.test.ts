import { createSearchRequestCoordinator } from '../src/screens/searchRequestCoordinator';

describe('searchRequestCoordinator', () => {
  it('invalidates an in-flight import when the query changes', () => {
    const coordinator = createSearchRequestCoordinator();
    const importRequest = coordinator.startAdding('https://example.com/a');

    expect(importRequest).not.toBeNull();
    coordinator.invalidate();

    expect(coordinator.isLatest(importRequest!)).toBe(false);
    expect(coordinator.getAddingUrl()).toBeNull();
  });

  it('keeps a newer import active when an older request finishes late', () => {
    const coordinator = createSearchRequestCoordinator();
    const first = coordinator.startAdding('https://example.com/a')!;
    coordinator.invalidate();
    const second = coordinator.startAdding('https://example.com/b')!;

    expect(coordinator.finishAdding(first)).toBe(false);
    expect(coordinator.getAddingUrl()).toBe('https://example.com/b');
    expect(coordinator.isLatest(second)).toBe(true);
  });

  it('lets a new search supersede an in-flight result add', () => {
    const coordinator = createSearchRequestCoordinator();
    const addRequest = coordinator.startAdding('https://example.com/a')!;
    const searchRequest = coordinator.startSearch();

    expect(coordinator.isLatest(addRequest)).toBe(false);
    expect(coordinator.isLatest(searchRequest)).toBe(true);
    expect(coordinator.getAddingUrl()).toBeNull();
  });

  it('blocks duplicate add starts until the active request is released', () => {
    const coordinator = createSearchRequestCoordinator();
    const first = coordinator.startAdding('https://example.com/a')!;

    expect(coordinator.startAdding('https://example.com/b')).toBeNull();
    expect(coordinator.finishAdding(first)).toBe(true);
    expect(coordinator.startAdding('https://example.com/b')).not.toBeNull();
  });
});
