import {
  buildReaderLineCacheKey,
  buildReaderScrollMeasurementKey,
  fingerprintReaderContent,
} from '../src/utils/readerScrollMeasurement';

const base = {
  chapterId: 'chapter-1',
  contentVersion: 'v2',
  content: '第一段正文\n第二段正文',
  textLength: 10,
  fontSize: 18,
  lineHeight: 1.7,
  paraGap: 12,
  fontFamily: 'serif',
  viewportWidth: 390,
  viewportHeight: 844,
};

describe('reader scroll measurement key', () => {
  it('is stable for the same chapter content and layout', () => {
    expect(buildReaderScrollMeasurementKey(base)).toBe(
      buildReaderScrollMeasurementKey({ ...base }),
    );
  });

  it('changes when the same chapter appends or replaces text', () => {
    expect(
      buildReaderScrollMeasurementKey({
        ...base,
        content: `${base.content}\n续载正文`,
      }),
    ).not.toBe(buildReaderScrollMeasurementKey(base));
    expect(
      buildReaderScrollMeasurementKey({
        ...base,
        content: '第一段改文\n第二段正文',
      }),
    ).not.toBe(buildReaderScrollMeasurementKey(base));
  });

  it('changes when typography or viewport changes', () => {
    expect(buildReaderScrollMeasurementKey({ ...base, fontSize: 20 })).not.toBe(
      buildReaderScrollMeasurementKey(base),
    );
    expect(
      buildReaderScrollMeasurementKey({ ...base, viewportWidth: 844 }),
    ).not.toBe(buildReaderScrollMeasurementKey(base));
  });

  it('invalidates line and page cache prefixes for equal-length replacement text', () => {
    const original = '甲乙丙丁';
    const replacement = '甲乙戊己';
    const lineKey = (content: string) =>
      buildReaderLineCacheKey({
        chapterId: 'chapter-1',
        textLength: 4,
        contentFingerprint: fingerprintReaderContent(content),
        maxWidth: 320,
        fontSize: 18,
        lineHeight: 1.7,
        fontFamily: 'serif',
      });

    expect(replacement).toHaveLength(original.length);
    expect(lineKey(replacement)).not.toBe(lineKey(original));
  });
});
