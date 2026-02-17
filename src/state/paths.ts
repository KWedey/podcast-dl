import { join } from 'node:path';

/**
 * Get the project-relative data directory for state files.
 * Uses <project-root>/data/ -- everything stays within the project directory.
 */
export function getDataDir(): string {
  return join(process.cwd(), 'data');
}

/** Path to the feeds.json state file */
export function getFeedsPath(): string {
  return join(getDataDir(), 'feeds.json');
}

/** Path to the history.json state file */
export function getHistoryPath(): string {
  return join(getDataDir(), 'history.json');
}
