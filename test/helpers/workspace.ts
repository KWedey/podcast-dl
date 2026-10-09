import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { expect, onTestFinished } from 'vitest';
import { createFeedsStore } from '../../src/state/feeds-store.js';
import type { DownloadHistory, Feed } from '../../src/types.js';

/** A throwaway project directory: the CLI's cwd, holding its data/ and downloads/. */
export interface Workspace {
  dir: string;
  feedsPath: string;
  historyPath: string;
  dataDir: string;
  downloadsDir: string;
}

/**
 * Create an isolated workspace, deleted when the current test finishes.
 * A failed test keeps it and prints its path, so the evidence survives.
 */
export async function createWorkspace(): Promise<Workspace> {
  // The real path is what the CLI sees as its cwd (macOS links /var to /private/var).
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'podcast-dl-test-')));
  onTestFinished(async ({ task }) => {
    if (task.result?.state === 'fail') {
      console.error(`Kept workspace of failed test "${task.name}": ${dir}`);
      return;
    }
    await rm(dir, { recursive: true, force: true });
  });
  const dataDir = join(dir, 'data');
  return {
    dir,
    dataDir,
    feedsPath: join(dataDir, 'feeds.json'),
    historyPath: join(dataDir, 'history.json'),
    downloadsDir: join(dir, 'downloads'),
  };
}

/** Subscribe to a feed by writing state directly, so download tests don't depend on `add`. */
export function subscribe(ws: Workspace, url: string, name: string): void {
  createFeedsStore(ws.feedsPath).add({ url, name, addedAt: new Date().toISOString() });
}

/** Every file under `root` as sorted `/`-separated relative paths; empty if `root` is missing. */
export async function listFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** feeds.json exactly as stored on disk. */
export async function readFeeds(ws: Workspace): Promise<Feed[]> {
  return JSON.parse(await readFile(ws.feedsPath, 'utf8')) as Feed[];
}

/** history.json exactly as stored on disk. */
export async function readHistory(ws: Workspace): Promise<DownloadHistory> {
  return JSON.parse(await readFile(ws.historyPath, 'utf8')) as DownloadHistory;
}

/**
 * After a run that was not killed, data/ holds only complete JSON files and
 * no temp files left over from an atomic write.
 */
export async function expectStateIntact(ws: Workspace): Promise<void> {
  const files = await listFiles(ws.dataDir);
  expect(files.filter((f) => f !== 'feeds.json' && f !== 'history.json')).toEqual([]);
  for (const file of files) {
    const raw = await readFile(join(ws.dataDir, file), 'utf8');
    expect(() => JSON.parse(raw), `${file} is not valid JSON`).not.toThrow();
  }
}
