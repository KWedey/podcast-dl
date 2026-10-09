import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFeedsStore } from '../../src/state/feeds-store.js';
import { runCli } from '../helpers/cli.js';
import { html, startFixtureServer, xml, type Handler } from '../helpers/fixture-server.js';
import { rssFeed } from '../helpers/rss.js';
import { createWorkspace, subscribe, type Workspace } from '../helpers/workspace.js';

const PODCAST_XML = rssFeed({ title: 'The Test Show' }, [
  { title: 'Episode 1', guid: 'episode-1', enclosure: { url: 'https://cdn.example.test/1.mp3', type: 'audio/mpeg' } },
]);

const savedFeeds = (ws: Workspace) => createFeedsStore(ws.feedsPath).getAll();

describe('podcast-dl add', () => {
  it('validates the feed and saves the subscription under its RSS title', async () => {
    const ws = await createWorkspace();
    const server = await startFixtureServer();
    server.route('/feed.xml', xml(PODCAST_XML));
    const url = server.url('/feed.xml');

    const result = await runCli(['add', url], ws.dir);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('Subscribed to "The Test Show"');
    expect(savedFeeds(ws)).toEqual([
      { url, name: 'The Test Show', addedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) },
    ]);
  });

  it.each<[string, Handler, string]>([
    ['a web page', html('<!doctype html><html><body>Welcome</body></html>'), 'URL is not a valid RSS or Atom feed'],
    ['an RSS feed with no audio', xml(rssFeed({ title: 'A Blog' }, [{ title: 'Post' }])), 'contains no audio enclosures'],
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
    expect((await runCli(['add', url], ws.dir)).code).toBe(0);

    const result = await runCli(['add', url], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Already subscribed: ${url}`);
    expect(savedFeeds(ws)).toHaveLength(1);
    expect(server.hits('/feed.xml')).toBe(1);
  });

  it.each([
    ['not-a-url', 'Invalid URL: not-a-url'],
    ['ftp://example.test/feed.xml', 'Invalid URL protocol: ftp:'],
  ])('rejects %j before touching the network', async (input, message) => {
    const ws = await createWorkspace();

    const result = await runCli(['add', input], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
    expect(existsSync(ws.feedsPath)).toBe(false);
  });
});

describe('podcast-dl list', () => {
  it('explains how to get started when there are no subscriptions', async () => {
    const ws = await createWorkspace();

    const result = await runCli(['list'], ws.dir);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('No feeds subscribed. Use "podcast-dl add <url>" to get started.');
  });

  it('prints each feed name and URL, sorted alphabetically regardless of case', async () => {
    const ws = await createWorkspace();
    subscribe(ws, 'https://example.test/zebra.xml', 'Zebra Talk');
    subscribe(ws, 'https://example.test/apple.xml', 'apple pie radio');
    subscribe(ws, 'https://example.test/mango.xml', 'Mango Hour');

    const result = await runCli(['list'], ws.dir);

    expect(result.code, result.stderr).toBe(0);
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

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('Unsubscribed from "The Daily"');
    expect(savedFeeds(ws).map((f) => f.url)).toEqual([WEEKLY]);
  });

  it('exits 1 and changes nothing when no feed matches', async () => {
    const ws = await workspaceWithTwoFeeds();

    const result = await runCli(['remove', 'The Monthly'], ws.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No feed found matching 'The Monthly'");
    expect(savedFeeds(ws).map((f) => f.url)).toEqual([DAILY, WEEKLY]);
  });
});
