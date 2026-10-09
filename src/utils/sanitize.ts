import filenamify from 'filenamify';

/** Maximum filename length -- tighter limit for readability on small screens */
const MAX_FILENAME_LENGTH = 100;

/** Character used to replace FAT32-illegal characters */
const REPLACEMENT_CHAR = '-';

/**
 * Windows cannot open a folder with one of these names, even on a FAT32 player.
 * It treats superscript digits as digits here too.
 */
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/u;

/**
 * Sanitize a string for use as a filename.
 * Removes FAT32-illegal characters and truncates to 100 characters.
 */
export function sanitizeFilename(name: string): string {
  return filenamify(name, {
    maxLength: MAX_FILENAME_LENGTH,
    replacement: REPLACEMENT_CHAR,
  });
}

/** Longest title kept in a filename, in user-perceived characters. */
const MAX_TITLE_CHARACTERS = 80;

/** Longest podcast folder name, in user-perceived characters. */
const MAX_DIR_CHARACTERS = 100;

/**
 * Most Linux filesystems cap a name at 255 bytes. This leaves room for the date
 * prefix, a collision hash and ".mp3.tmp". FAT32 counts UTF-16 units, never
 * more than the UTF-8 bytes, so a name within this fits there too.
 */
const MAX_NAME_BYTES = 200;

/** Keep at most `maxCharacters` user-perceived characters and `maxBytes` UTF-8 bytes, never splitting one. */
function cutGraphemes(text: string, maxCharacters: number, maxBytes: number): string {
  let result = '';
  let characters = 0;
  let bytes = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    bytes += Buffer.byteLength(segment);
    if (characters === maxCharacters || bytes > maxBytes) break;
    result += segment;
    characters++;
  }
  return result;
}

/** Shorten a sanitized title for a filename without splitting a character or emoji. */
export function shortenTitle(title: string): string {
  return cutGraphemes(title, MAX_TITLE_CHARACTERS, MAX_NAME_BYTES);
}

/**
 * Sanitize a string for use as a podcast directory name: lowercase letters,
 * marks and digits in any script, joined by dashes. Every character kept is
 * legal on FAT32, Windows and Linux, and the name is NFC so the same title
 * always maps to the same folder.
 *
 * Examples:
 *   "The Joe Rogan Experience" -> "the-joe-rogan-experience"
 *   "Café Society"             -> "café-society"
 *   "ラジオ深夜便"               -> "ラジオ深夜便"
 *   ":::" or "🎙️"             -> "unknown-podcast"
 */
export function sanitizeDirName(name: string): string {
  // filenamify turns separators like ":" and "/" into dashes before the slug strips symbols.
  const safe = filenamify(name, {
    maxLength: Number.POSITIVE_INFINITY,
    replacement: REPLACEMENT_CHAR,
  });

  const slug = safe
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{M}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const cut = cutGraphemes(slug, MAX_DIR_CHARACTERS, MAX_NAME_BYTES).replace(/-+$/, '');

  if (!/[\p{L}\p{N}]/u.test(cut)) return 'unknown-podcast';

  // filenamify suffixes device names, but the slug step strips that suffix again.
  return WINDOWS_DEVICE_NAME.test(cut) ? `${cut}-podcast` : cut;
}
