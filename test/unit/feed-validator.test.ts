import { describe, expect, it } from 'vitest';
import { validateFeed } from '../../src/services/feed-validator.js';
import { html, startFixtureServer, status, unreachableUrl, xml } from '../helpers/fixture-server.js';
import { rssFeed, type ChannelSpec, type ItemSpec } from '../helpers/rss.js';

const NO_MP3_EPISODES = 'Feed has no MP3 episodes';

const MP3_ITEM: ItemSpec = {
  title: 'Episode 1',
  guid: 'episode-1',
  enclosure: { url: 'https://cdn.example.test/1.mp3', type: 'audio/mpeg' },
};

async function serveFeed(channel: ChannelSpec, items: ItemSpec[]): Promise<string> {
  const server = await startFixtureServer();
  server.route('/feed.xml', xml(rssFeed(channel, items)));
  return server.url('/feed.xml');
}

describe('validateFeed', () => {
  it('accepts an RSS feed with an MP3 enclosure and returns the podcast title', async () => {
    const url = await serveFeed({ title: 'The Test Show' }, [MP3_ITEM]);
    await expect(validateFeed(url)).resolves.toEqual({ title: 'The Test Show' });
  });

  it('falls back to <itunes:title> when the channel has no <title>', async () => {
    const url = await serveFeed({ itunesTitle: 'iTunes Name' }, [MP3_ITEM]);
    await expect(validateFeed(url)).resolves.toEqual({ title: 'iTunes Name' });
  });

  it('names a feed with no title at all "Untitled Podcast"', async () => {
    const url = await serveFeed({}, [MP3_ITEM]);
    await expect(validateFeed(url)).resolves.toEqual({ title: 'Untitled Podcast' });
  });

  it('rejects a page that is not a feed', async () => {
    const server = await startFixtureServer();
    server.route('/', html('<!doctype html><html><body>Welcome</body></html>'));

    await expect(validateFeed(server.url('/'))).rejects.toThrow('URL is not a valid RSS or Atom feed');
  });

  // Anything accepted here must yield at least one episode `download` can fetch.
  it.each([
    ['has no enclosures', { title: 'Blog post' }],
    ['only encloses images', { title: 'Cover art', enclosure: { url: 'https://cdn.example.test/a.jpg', type: 'image/jpeg' } }],
    ['only encloses non-MP3 audio', { title: 'AAC', enclosure: { url: 'https://cdn.example.test/a.m4a', type: 'audio/x-m4a' } }],
  ])('rejects an RSS feed whose items %s', async (_case, item: ItemSpec) => {
    const url = await serveFeed({ title: 'Not A Podcast' }, [item]);
    await expect(validateFeed(url)).rejects.toThrow(NO_MP3_EPISODES);
  });

  it('rejects an Atom feed, whose enclosures download cannot read', async () => {
    const server = await startFixtureServer();
    server.route(
      '/atom.xml',
      xml(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Show</title><id>urn:show</id><updated>2024-01-01T00:00:00Z</updated>
<entry><title>Episode 1</title><id>urn:ep1</id><updated>2024-01-01T00:00:00Z</updated>
<link rel="enclosure" type="audio/mpeg" href="https://cdn.example.test/1.mp3"/></entry></feed>`),
    );

    await expect(validateFeed(server.url('/atom.xml'))).rejects.toThrow(NO_MP3_EPISODES);
  });

  it('reports the HTTP status when the server refuses', async () => {
    const server = await startFixtureServer();
    server.route('/feed.xml', status(404));
    const url = server.url('/feed.xml');

    await expect(validateFeed(url)).rejects.toThrow(`HTTP 404 fetching ${url}`);
  });

  it('reports a host that cannot be reached', async () => {
    await expect(validateFeed(await unreachableUrl('/feed.xml'))).rejects.toThrow(/^Failed to fetch URL/);
  });
});
