import { readFileSync } from 'node:fs';

/**
 * Read a JSON state file, or return `empty()` when it does not exist yet or
 * holds nothing at all.
 *
 * A file with content that cannot be used is an error, never an empty state:
 * reading it as empty would silently overwrite the user's subscriptions or
 * history on the next write.
 *
 * @param decode - Returns the typed state, or undefined if `data` has the wrong shape
 * @param expected - What the file should hold, for the error message
 */
export function readStateFile<T>(
  filePath: string,
  empty: () => T,
  decode: (data: unknown) => T | undefined,
  expected: string,
): T {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return empty();
    }
    throw unusableStateFile(filePath, error instanceof Error ? error.message : String(error));
  }

  // Some editors save a byte order mark, which JSON.parse rejects.
  const json = raw.replace(/^\uFEFF/, '');
  if (json.trim() === '') {
    return empty();
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw unusableStateFile(filePath, 'not valid JSON');
  }

  const state = decode(data);
  if (state === undefined) {
    throw unusableStateFile(filePath, `expected ${expected}`);
  }
  return state;
}

function unusableStateFile(filePath: string, reason: string): Error {
  return new Error(
    `Cannot read ${filePath}: ${reason}. podcast-dl will not overwrite it; fix or move the file, then run again.`,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
