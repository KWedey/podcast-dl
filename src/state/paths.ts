import { join } from 'node:path';

/** Data directory for state files: data/ under the current working directory. */
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

/** Downloads directory for episode files: downloads/ under the current working directory. */
export function getDownloadsDir(): string {
  return join(process.cwd(), 'downloads');
}
