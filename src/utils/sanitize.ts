import filenamify from 'filenamify';

/** Maximum filename length -- tighter limit for readability on small screens */
const MAX_FILENAME_LENGTH = 100;

/** Character used to replace FAT32-illegal characters */
const REPLACEMENT_CHAR = '-';

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

/**
 * Sanitize a string for use as a podcast directory name.
 * Strips FAT32-illegal characters, then slugifies to lowercase + dashes.
 *
 * Examples:
 *   "The Joe Rogan Experience" -> "the-joe-rogan-experience"
 *   "My Podcast: Awesome!"     -> "my-podcast-awesome"
 *   ":::"                      -> "unknown-podcast"
 */
export function sanitizeDirName(name: string): string {
  // First strip FAT32-illegal characters
  const safe = filenamify(name, {
    maxLength: MAX_FILENAME_LENGTH,
    replacement: REPLACEMENT_CHAR,
  });

  // Then slugify: lowercase + dashes only
  const slug = safe
    .toLowerCase()
    .replace(/\s+/g, '-')       // whitespace runs -> single dash
    .replace(/[^a-z0-9-]/g, '') // strip anything that isn't alphanumeric or dash
    .replace(/-+/g, '-')        // collapse consecutive dashes
    .replace(/^-+|-+$/g, '');   // trim leading/trailing dashes

  // Fallback for edge case where input is entirely illegal characters
  return slug || 'unknown-podcast';
}
