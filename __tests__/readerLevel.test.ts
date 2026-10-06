import {
  READER_LEVELS,
  readerGrowthMinutes,
  resolveReaderLevel,
} from '../src/utils/readerLevel';
import { normalizeProfileAppearance } from '../src/store/types/profile';

describe('reader level', () => {
  it('按累计阅读分钟计算等级、进度与剩余分钟', () => {
    expect(resolveReaderLevel(120)).toMatchObject({
      current: { level: 2, title: '青灯读者' },
      next: { level: 3 },
      progress: 0.5,
      remainingMinutes: 60,
    });
  });

  it('最高等级保持满进度', () => {
    expect(resolveReaderLevel(60000)).toMatchObject({
      current: { level: 20 },
      next: null,
      progress: 1,
      remainingMinutes: 0,
    });
  });

  it('旧版满级的 30 小时只到 7 级，10 级和满级需要长期积累', () => {
    expect(resolveReaderLevel(1800).current.level).toBe(7);
    expect(resolveReaderLevel(6000).current.level).toBe(10);
    expect(resolveReaderLevel(59999).current.level).toBe(19);
    for (const item of READER_LEVELS.slice(1)) {
      expect(resolveReaderLevel(item.thresholdMinutes - 1).current.level).toBe(
        item.level - 1,
      );
      expect(resolveReaderLevel(item.thresholdMinutes).current.level).toBe(
        item.level,
      );
    }
  });

  it('每天封顶但不改写历史，跨日积累且不把零碎秒数逐次取整', () => {
    const records = {
      '2026-10-01': 30 * 3600,
      '2026-10-02': 7200,
      '2026-10-03': 30,
      '2026-10-04': 30,
    };
    expect(readerGrowthMinutes(records)).toBe(241);
    expect(records['2026-10-01']).toBe(30 * 3600);
    expect(
      resolveReaderLevel(readerGrowthMinutes({ day: 30 * 3600 })).current.level,
    ).toBe(2);
  });

  it('负数和非有限值不能导致满级', () => {
    for (const value of [NaN, Infinity, -1])
      expect(resolveReaderLevel(value).current.level).toBe(1);
    expect(readerGrowthMinutes({ a: Infinity, b: NaN, c: -10 })).toBe(0);
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
