import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { expect, onTestFinished } from 'vitest';
import { createFeedsStore } from '../../src/state/feeds-store.js';
import type { DownloadHistory } from '../../src/types.js';

/** A throwaway project directory: the CLI's cwd, holding its data/ and downloads/. */
export interface Workspace {
  dir: string;
  feedsPath: string;
  historyPath: string;
  dataDir: string;
  downloadsDir: string;
}

/** Create an isolated workspace that is deleted when the current test finishes. */
export async function createWorkspace(): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), 'podcast-dl-test-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
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

export async function readHistory(ws: Workspace): Promise<DownloadHistory> {
  return JSON.parse(await readFile(ws.historyPath, 'utf8')) as DownloadHistory;
}

/**
 * State must never be observable half-written: data/ holds only complete JSON
 * files, with no temp files left over from an interrupted atomic write.
 */
export async function expectStateIntact(ws: Workspace): Promise<void> {
  const files = await listFiles(ws.dataDir);
  expect(files.filter((f) => f !== 'feeds.json' && f !== 'history.json')).toEqual([]);
  for (const file of files) {
    const raw = await readFile(join(ws.dataDir, file), 'utf8');
    expect(() => JSON.parse(raw), `${file} is not valid JSON`).not.toThrow();
  }
}
