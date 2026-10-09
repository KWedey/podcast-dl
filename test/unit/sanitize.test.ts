import { describe, expect, it } from 'vitest';
import { sanitizeDirName, sanitizeFilename, shortenTitle } from '../../src/utils/sanitize.js';

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

describe('shortenTitle', () => {
  it('keeps a short title whole', () => {
    expect(shortenTitle('Episode 12 - Café')).toBe('Episode 12 - Café');
  });

  it('keeps at most 80 characters', () => {
    expect(shortenTitle('x'.repeat(100))).toBe('x'.repeat(80));
  });

  it('never splits an emoji, even one built from several code points', () => {
    const family = '👨‍👩‍👧';
    expect(shortenTitle(`${'a'.repeat(79)}${family} and more`)).toBe(`${'a'.repeat(79)}${family}`);
  });

  it('stays within 200 UTF-8 bytes, so the full filename fits a 255-byte limit', () => {
    const title = shortenTitle('語'.repeat(100));
    expect(title).toBe('語'.repeat(66));
    expect(Buffer.byteLength(title)).toBeLessThanOrEqual(200);
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

  it.each([
    ['Café Society', 'café-society'],
    ['Ελληνικά Νέα', 'ελληνικά-νέα'],
    ['Радио Свобода', 'радио-свобода'],
    ['ラジオ深夜便', 'ラジオ深夜便'],
    ['हिन्दी पॉडकास्ट', 'हिन्दी-पॉडकास्ट'],
    ['Señor Café №1', 'señor-café-1'],
  ])('keeps the letters, accents and marks of %j: %j', (name, slug) => {
    expect(sanitizeDirName(name)).toBe(slug);
  });

  it('names a podcast the same whether its accents arrive composed or decomposed', () => {
    expect(sanitizeDirName('Cafe\u0301 Society')).toBe('caf\u00e9-society');
  });

  it.each([':::', '🎙️ 🎧', '\u0301\u0301'])('falls back to a fixed name when %j leaves no letter or digit', (name) => {
    expect(sanitizeDirName(name)).toBe('unknown-podcast');
  });

  it('keeps a long non-Latin name within 200 UTF-8 bytes, cutting between characters', () => {
    const dir = sanitizeDirName('語'.repeat(100));
    expect(dir).toBe('語'.repeat(66));
    expect(Buffer.byteLength(dir)).toBeLessThanOrEqual(200);
  });

  it('never ends on a dash after cutting a long name', () => {
    expect(sanitizeDirName(`${'a'.repeat(99)} b`)).toBe('a'.repeat(99));
  });

  it.each(['CON', 'Aux', 'nul', 'PRN', 'COM1', 'lpt9', 'COM¹', 'LPT³'])(
    'never produces the Windows device name %j, which a FAT32 player read on Windows cannot open',
    (name) => {
      expect(sanitizeDirName(name)).toBe(`${name.toLowerCase()}-podcast`);
    },
  );

  it('caps length at 100 characters', () => {
    expect(sanitizeDirName('x'.repeat(150))).toHaveLength(100);
  });
});
