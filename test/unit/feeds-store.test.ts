import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFeedsStore } from '../../src/state/feeds-store.js';
import type { Feed } from '../../src/types.js';
import { createWorkspace } from '../helpers/workspace.js';

const daily: Feed = { url: 'https://example.test/daily.xml', name: 'The Daily', addedAt: '2024-01-01T00:00:00.000Z' };
const weekly: Feed = { url: 'https://example.test/weekly.xml', name: 'The Weekly', addedAt: '2024-01-02T00:00:00.000Z' };

describe('feeds store', () => {
  it('starts empty when no state file exists yet', async () => {
    const ws = await createWorkspace();
    expect(createFeedsStore(ws.feedsPath).getAll()).toEqual([]);
  });

  it('persists added feeds for later runs', async () => {
    const ws = await createWorkspace();
    createFeedsStore(ws.feedsPath).add(daily);
    createFeedsStore(ws.feedsPath).add(weekly);

    const reopened = createFeedsStore(ws.feedsPath);
    expect(reopened.getAll()).toEqual([daily, weekly]);
    expect(reopened.has(daily.url)).toBe(true);
    expect(reopened.has('https://example.test/other.xml')).toBe(false);
  });

  it('removes only the feed with the given URL', async () => {
    const ws = await createWorkspace();
    const store = createFeedsStore(ws.feedsPath);
    store.add(daily);
    store.add(weekly);

    expect(store.remove(daily.url)).toBe(true);
    expect(createFeedsStore(ws.feedsPath).getAll()).toEqual([weekly]);
  });

  it('reports a miss and leaves the file untouched when no feed has that URL', async () => {
    const ws = await createWorkspace();
    const store = createFeedsStore(ws.feedsPath);
    store.add(daily);
    const before = readFileSync(ws.feedsPath, 'utf8');

    expect(store.remove('https://example.test/missing.xml')).toBe(false);
    expect(readFileSync(ws.feedsPath, 'utf8')).toBe(before);
  });

  it('treats a corrupt state file as empty instead of crashing', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.feedsPath, '[{"url": "https://exa');

    expect(createFeedsStore(ws.feedsPath).getAll()).toEqual([]);
  });
});
