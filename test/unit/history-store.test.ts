import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHistoryStore } from '../../src/state/history-store.js';
import { createWorkspace, readHistory } from '../helpers/workspace.js';

const FEED = 'https://example.test/feed.xml';
const OTHER_FEED = 'https://example.test/other.xml';

describe('history store', () => {
  it('reports an unseen episode as not downloaded', async () => {
    const ws = await createWorkspace();
    const history = createHistoryStore(ws.historyPath);

    expect(history.isDownloaded(FEED, 'guid-1')).toBe(false);
    expect(history.getDownloadedGuids(FEED)).toEqual([]);
  });

  it('remembers downloaded GUIDs across runs', async () => {
    const ws = await createWorkspace();
    createHistoryStore(ws.historyPath).markDownloaded(FEED, 'guid-1');
    createHistoryStore(ws.historyPath).markDownloaded(FEED, 'guid-2');

    const reopened = createHistoryStore(ws.historyPath);
    expect(reopened.isDownloaded(FEED, 'guid-1')).toBe(true);
    expect(reopened.getDownloadedGuids(FEED)).toEqual(['guid-1', 'guid-2']);
  });

  it('tracks GUIDs per feed, so the same GUID in another feed is still new', async () => {
    const ws = await createWorkspace();
    const history = createHistoryStore(ws.historyPath);
    history.markDownloaded(FEED, 'guid-1');

    expect(history.isDownloaded(OTHER_FEED, 'guid-1')).toBe(false);
  });

  it('records a failure without counting the episode as downloaded', async () => {
    const ws = await createWorkspace();
    const history = createHistoryStore(ws.historyPath);
    history.markFailed(FEED, 'guid-1');

    expect(history.isFailed(FEED, 'guid-1')).toBe(true);
    expect(history.isDownloaded(FEED, 'guid-1')).toBe(false);
    expect(history.getDownloadedGuids(FEED)).toEqual([]);
  });

  it('upgrades a failed episode to downloaded in place when a retry succeeds', async () => {
    const ws = await createWorkspace();
    const history = createHistoryStore(ws.historyPath);
    history.markFailed(FEED, 'guid-1');
    history.markDownloaded(FEED, 'guid-1');

    expect(history.isFailed(FEED, 'guid-1')).toBe(false);
    expect(await readHistory(ws)).toEqual({ [FEED]: [{ guid: 'guid-1', status: 'downloaded' }] });
  });

  it('reads the legacy format (bare GUID arrays) as downloaded', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.historyPath, JSON.stringify({ [FEED]: ['old-1', 'old-2'] }));

    const history = createHistoryStore(ws.historyPath);
    expect(history.getDownloadedGuids(FEED)).toEqual(['old-1', 'old-2']);
    expect(history.isDownloaded(FEED, 'old-2')).toBe(true);
  });

  it('reads an empty state file as no history', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.historyPath, '');

    const history = createHistoryStore(ws.historyPath);
    expect(history.getDownloadedGuids(FEED)).toEqual([]);
    history.markDownloaded(FEED, 'guid-1');
    expect(await readHistory(ws)).toEqual({ [FEED]: [{ guid: 'guid-1', status: 'downloaded' }] });
  });

  it('reads a feed that mixes legacy GUIDs with current entries', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.historyPath, JSON.stringify({ [FEED]: [{ guid: 'new-1', status: 'failed' }, 'old-1'] }));

    const history = createHistoryStore(ws.historyPath);
    expect(history.isFailed(FEED, 'new-1')).toBe(true);
    expect(history.isDownloaded(FEED, 'old-1')).toBe(true);
  });

  it.each([
    ['is not valid JSON', '{"https://exa', 'not valid JSON'],
    ['is JSON but not a history map', '["guid-1"]', 'expected an object of feed URLs to episode lists'],
    ['has an entry with an unknown status', '{"https://example.test/feed.xml": [{"guid": "a", "status": "queued"}]}', 'expected an object of feed URLs to episode lists'],
  ])('refuses a state file that %s, naming it, and leaves it untouched', async (_case, content, reason) => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.historyPath, content);

    expect(() => createHistoryStore(ws.historyPath)).toThrow(`Cannot read ${ws.historyPath}: ${reason}`);
    expect(readFileSync(ws.historyPath, 'utf8')).toBe(content);
  });
});
