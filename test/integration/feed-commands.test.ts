import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectSuccess, runCli } from '../helpers/cli.js';
import { html, startFixtureServer, xml, type Handler } from '../helpers/fixture-server.js';
import { rssFeed } from '../helpers/rss.js';
import { createWorkspace, readFeeds, subscribe, type Workspace } from '../helpers/workspace.js';

const PODCAST_XML = rssFeed({ title: 'The Test Show' }, [
  { title: 'Episode 1', guid: 'episode-1', enclosure: { url: 'https://cdn.example.test/1.mp3', type: 'audio/mpeg' } },
]);

describe('podcast-dl add', () => {
  it('validates the feed and saves the subscription under its RSS title', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(PODCAST_XML));
    const url = server.url('/feed.xml');

    const result = await runCli(['add', url], ws.dir);

    expectSuccess(result);
    expect(result.stdout).toContain('Subscribed to "The Test Show"');
    expect(await readFeeds(ws)).toEqual([
      { url, name: 'The Test Show', addedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) },
    ]);
  });

  it.each<[string, Handler, string]>([
    ['a web page', html('<!doctype html><html><body>Welcome</body></html>'), 'URL is not a valid RSS feed'],
    ['an RSS feed with no audio', xml(rssFeed({ title: 'A Blog' }, [{ title: 'Post' }])), 'Feed has no MP3 episodes'],
    [
      'a feed with only non-MP3 audio, which download could never fetch',
      xml(rssFeed({ title: 'AAC Show' }, [{ title: 'Ep', enclosure: { url: 'https://cdn.example.test/1.m4a', type: 'audio/x-m4a' } }])),
      'Feed has no MP3 episodes',
    ],
  ])('rejects %s, exits 1, and saves nothing', async (_case, handler, message) => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', handler);

    const result = await runCli(['add', server.url('/feed.xml')], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(existsSync(ws.feedsPath)).toBe(false);
  });

  it('refuses a duplicate subscription without fetching the feed again', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(PODCAST_XML));
    const url = server.url('/feed.xml');
    expectSuccess(await runCli(['add', url], ws.dir));

    const result = await runCli(['add', url], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Already subscribed: ${url}`);
    expect(await readFeeds(ws)).toHaveLength(1);
    expect(server.hits('/feed.xml')).toBe(1);
  });

  it.each([
    ['not-a-url', 'Invalid URL: not-a-url'],
    ['ftp://example.test/feed.xml', 'Invalid URL protocol: ftp:'],
  ])('rejects %j with exit 1 and saves nothing', async (input, message) => {
    const ws = await createWorkspace();

    const result = await runCli(['add', input], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(existsSync(ws.feedsPath)).toBe(false);
  });
});

describe('a corrupt feeds.json', () => {
  it.each([['add'], ['list'], ['remove']])('stops %s with an error naming the file, and leaves it untouched', async (command) => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(PODCAST_XML));
    mkdirSync(ws.dataDir, { recursive: true });
    const corrupt = '[{"url": "https://example.test/daily.xml", "name": "The Da';
    writeFileSync(ws.feedsPath, corrupt);
    const args = { add: ['add', server.url('/feed.xml')], list: ['list'], remove: ['remove', 'The Daily'] }[command]!;

    const result = await runCli(args, ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Cannot read ${ws.feedsPath}: not valid JSON`);
    expect(result.stderr).toContain('podcast-dl will not overwrite it');
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(readFileSync(ws.feedsPath, 'utf8')).toBe(corrupt);
    expect(server.requests).toEqual([]);
  });
});

describe('an unexpected error', () => {
  it('exits 1 and prints its stack trace, so the bug can be traced', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(PODCAST_XML));

    const result = await runCli(['add', server.url('/feed.xml')], ws.dir, {
      NODE_OPTIONS: `--import=${new URL('../fixtures/rename-fails.mjs', import.meta.url).href}`,
      RENAME_FAILS_FOR: 'feeds.json',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('EROFS: read-only file system');
    expect(result.stderr).toMatch(/^\s+at .*atomic-write\.ts/m);
  });
});

describe('podcast-dl list', () => {
  it('explains how to get started when there are no subscriptions', async () => {
    const ws = await createWorkspace();

    const result = await runCli(['list'], ws.dir);

    expectSuccess(result);
    expect(result.stdout).toContain('No feeds subscribed. Use "podcast-dl add <url>" to get started.');
  });

  it('prints each feed name and URL, sorted alphabetically regardless of case', async () => {
    const ws = await createWorkspace();
    subscribe(ws, 'https://example.test/zebra.xml', 'Zebra Talk');
    subscribe(ws, 'https://example.test/apple.xml', 'apple pie radio');
    subscribe(ws, 'https://example.test/mango.xml', 'Mango Hour');

    const result = await runCli(['list'], ws.dir);

    expectSuccess(result);
    expect(result.stdout.trimEnd().split('\n')).toEqual([
      'apple pie radio',
      'https://example.test/apple.xml',
      '',
      'Mango Hour',
      'https://example.test/mango.xml',
      '',
      'Zebra Talk',
      'https://example.test/zebra.xml',
    ]);
  });
});

describe('podcast-dl remove', () => {
  const DAILY = 'https://example.test/daily.xml';
  const WEEKLY = 'https://example.test/weekly.xml';

  async function workspaceWithTwoFeeds(): Promise<Workspace> {
    const ws = await createWorkspace();
    subscribe(ws, DAILY, 'The Daily');
    subscribe(ws, WEEKLY, 'The Weekly');
    return ws;
  }

  it.each([
    ['its exact URL', DAILY],
    ['its name, ignoring case', 'the DAILY'],
  ])('unsubscribes a feed by %s', async (_case, identifier) => {
    const ws = await workspaceWithTwoFeeds();

    const result = await runCli(['remove', identifier], ws.dir);

    expectSuccess(result);
    expect(result.stdout).toContain('Unsubscribed from "The Daily"');
    expect((await readFeeds(ws)).map((f) => f.url)).toEqual([WEEKLY]);
  });

  it('exits 1 and changes nothing when no feed matches', async () => {
    const ws = await workspaceWithTwoFeeds();

    const result = await runCli(['remove', 'The Monthly'], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No feed found matching 'The Monthly'");
    expect((await readFeeds(ws)).map((f) => f.url)).toEqual([DAILY, WEEKLY]);
  });
});
