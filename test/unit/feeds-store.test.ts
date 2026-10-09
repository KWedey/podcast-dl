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

  it.each([
    ['empty', ''],
    ['only whitespace', ' \n'],
  ])('reads a state file that is %s as no feeds, since it holds nothing to lose', async (_case, content) => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.feedsPath, content);

    const store = createFeedsStore(ws.feedsPath);
    expect(store.getAll()).toEqual([]);
    store.add(daily);
    expect(createFeedsStore(ws.feedsPath).getAll()).toEqual([daily]);
  });

  it('reads a state file an editor saved with a UTF-8 byte order mark', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.feedsPath, `\uFEFF${JSON.stringify([daily])}`);

    expect(createFeedsStore(ws.feedsPath).getAll()).toEqual([daily]);
  });

  it('refuses a state path that exists but cannot be read as a file, naming it', async () => {
    const ws = await createWorkspace();
    mkdirSync(ws.feedsPath, { recursive: true });

    expect(() => createFeedsStore(ws.feedsPath)).toThrow(`Cannot read ${ws.feedsPath}: EISDIR`);
  });

  it.each([
    ['is not valid JSON', '[{"url": "https://exa', 'not valid JSON'],
    ['is JSON but not a list of feeds', '{"url": "https://example.test/daily.xml"}', 'expected a list of feeds'],
    ['lists a feed without a URL', '[{"name": "The Daily", "addedAt": "2024-01-01T00:00:00.000Z"}]', 'expected a list of feeds'],
  ])('refuses a state file that %s, naming it, and leaves it untouched', async (_case, content, reason) => {
    const ws = await createWorkspace();
    mkdirSync(ws.dataDir, { recursive: true });
    writeFileSync(ws.feedsPath, content);

    expect(() => createFeedsStore(ws.feedsPath)).toThrow(`Cannot read ${ws.feedsPath}: ${reason}`);
    expect(readFileSync(ws.feedsPath, 'utf8')).toBe(content);
  });
});
