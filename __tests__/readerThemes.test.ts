import {
  isReaderNightTheme,
  resolveReaderThemeChange,
} from '../src/theme/readerThemes';

describe('resolveReaderThemeChange', () => {
  it('remembers the active day theme when entering night mode', () => {
    expect(resolveReaderThemeChange('green', 'paper', 'night')).toEqual({
      theme: 'night',
      dayTheme: 'green',
    });
  });

  it('keeps the remembered day theme while already in night mode', () => {
    expect(resolveReaderThemeChange('night', 'green', 'night')).toEqual({
      theme: 'night',
      dayTheme: 'green',
    });
  });

  it('keeps the remembered day theme when choosing the scenic night theme', () => {
    expect(resolveReaderThemeChange('green', 'paper', 'cosmos')).toEqual({
      theme: 'cosmos',
      dayTheme: 'green',
    });
    expect(isReaderNightTheme('cosmos')).toBe(true);
  });

  it('updates the remembered theme when choosing another day background', () => {
    expect(resolveReaderThemeChange('night', 'green', 'gray')).toEqual({
      theme: 'gray',
      dayTheme: 'gray',
    });
  });

  it('falls back to paper for legacy night settings without memory', () => {
    expect(resolveReaderThemeChange('night', undefined, 'night')).toEqual({
      theme: 'night',
      dayTheme: 'paper',
    });
  });
});
