import { describe, expect, it } from 'vitest';
import { sanitizeDirName, sanitizeFilename } from '../../src/utils/sanitize.js';

const FAT32_ILLEGAL = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

describe('sanitizeFilename', () => {
  it.each(FAT32_ILLEGAL)('replaces the FAT32-illegal character %j with a dash', (char) => {
    expect(sanitizeFilename(`before${char}after`)).toBe('before-after');
  });

  it('removes every control character but keeps the surrounding text', () => {
    const allControlChars = String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i));
    const result = sanitizeFilename(`a${allControlChars}b`);

    expect(result).toMatch(/^a.*b$/);
    expect(result).not.toMatch(/[\u0000-\u001f]/);
  });

  it('leaves ordinary punctuation and non-ASCII letters readable', () => {
    expect(sanitizeFilename("Episode 12 - Café & Friends (Part 1) 'Live'")).toBe(
      "Episode 12 - Café & Friends (Part 1) 'Live'",
    );
  });

  it.each([
    ['..', '-'],
    ['../../etc/passwd', '-..-etc-passwd'],
  ])('turns the path-traversal attempt %j into the plain name %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('suffixes names Windows reserves for devices', () => {
    expect(sanitizeFilename('CON')).toBe('CON-');
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
