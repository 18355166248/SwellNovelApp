import { getReaderArtworkOpacity } from '../src/theme/readerBackgroundAssets';

describe('getReaderArtworkOpacity', () => {
  it('maps background intensity directly to artwork opacity', () => {
    expect(getReaderArtworkOpacity('cosmos', 0)).toBe(0);
    expect(getReaderArtworkOpacity('cosmos', 0.5)).toBe(0.5);
    expect(getReaderArtworkOpacity('cosmos', 1)).toBe(1);
  });

  it('clamps values to the supported range', () => {
    expect(getReaderArtworkOpacity('bamboo', -1)).toBe(0);
    expect(getReaderArtworkOpacity('sunset', 2)).toBe(1);
  });
});
