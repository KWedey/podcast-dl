import { describe, expect, it } from 'vitest';
import { sanitizeDirName, sanitizeFilename } from '../../src/utils/sanitize.js';

const FAT32_ILLEGAL = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

describe('sanitizeFilename', () => {
  it.each(FAT32_ILLEGAL)('replaces the FAT32-illegal character %j with a dash', (char) => {
    expect(sanitizeFilename(`before${char}after`)).toBe('before-after');
  });

  it('removes every control character', () => {
    const allControlChars = String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i));
    expect(sanitizeFilename(`a${allControlChars}b`)).not.toMatch(/[\u0000-\u001f]/);
  });

  it('leaves ordinary punctuation and non-ASCII letters readable', () => {
    expect(sanitizeFilename("Episode 12 - Café & Friends (Part 1) 'Live'")).toBe(
      "Episode 12 - Café & Friends (Part 1) 'Live'",
    );
  });

  it('cannot produce a path that escapes its directory', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toMatch(/[/\\]/);
    expect(sanitizeFilename('..')).not.toBe('..');
  });

  it('avoids names reserved by Windows/FAT drivers', () => {
    expect(sanitizeFilename('CON')).not.toBe('CON');
  });

  it('caps length at 100 characters', () => {
    expect(sanitizeFilename('x'.repeat(150))).toHaveLength(100);
  });
});

describe('sanitizeDirName', () => {
  it.each([
    ['The Joe Rogan Experience', 'the-joe-rogan-experience'],
    ['My Podcast: Awesome!', 'my-podcast-awesome'],
    ['Late Night: Q&A / Talk?', 'late-night-qa-talk'],
    ['  Lots   of   space  ', 'lots-of-space'],
  ])('slugifies %j to %j', (name, slug) => {
    expect(sanitizeDirName(name)).toBe(slug);
  });

  it('falls back to a fixed name when nothing usable is left', () => {
    expect(sanitizeDirName(':::')).toBe('unknown-podcast');
  });

  it('caps length at 100 characters', () => {
    expect(sanitizeDirName('x'.repeat(150))).toHaveLength(100);
  });
});
