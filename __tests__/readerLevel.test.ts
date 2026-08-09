import { resolveReaderLevel } from '../src/utils/readerLevel';
import { normalizeProfileAppearance } from '../src/store/types/profile';

describe('reader level', () => {
  it('按累计阅读分钟计算等级、进度与剩余分钟', () => {
    expect(resolveReaderLevel(120)).toMatchObject({
      current: { level: 3, title: '墨香读者' },
      next: { level: 4 },
      progress: 1 / 3,
      remainingMinutes: 60,
    });
  });

  it('最高等级保持满进度', () => {
    expect(resolveReaderLevel(9999)).toMatchObject({
      current: { level: 10 },
      next: null,
      progress: 1,
      remainingMinutes: 0,
    });
  });

  it('无效装扮回退到默认值', () => {
    expect(
      normalizeProfileAppearance({
        avatarId: 'unknown' as never,
        frameId: 'unknown' as never,
      }),
    ).toEqual({ avatarId: 'scholar', frameId: 'ink-jade' });
  });
});
