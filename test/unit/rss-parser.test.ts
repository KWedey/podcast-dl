import { describe, expect, it } from 'vitest';
import { fetchEpisodes } from '../../src/services/rss-parser.js';
import { startFixtureServer, status, xml } from '../helpers/fixture-server.js';
import { rssFeed, type ItemSpec } from '../helpers/rss.js';

const mp3 = (n: number) => ({ url: `https://cdn.example.test/${n}.mp3`, type: 'audio/mpeg' });

async function episodesOf(items: ItemSpec[]) {
  const server = await startFixtureServer();
  server.route('/feed.xml', xml(rssFeed({ title: 'The Test Show' }, items)));
  return fetchEpisodes(server.url('/feed.xml'));
}

describe('fetchEpisodes', () => {
  it('maps an MP3 item to an episode with its GUID, title, audio URL and ISO date', async () => {
    const episodes = await episodesOf([
      { title: 'Episode 1', guid: 'episode-1', pubDate: 'Mon, 01 Jan 2024 12:00:00 GMT', enclosure: mp3(1) },
    ]);

    expect(episodes).toEqual([
      {
        guid: 'episode-1',
        title: 'Episode 1',
        audioUrl: 'https://cdn.example.test/1.mp3',
        mimeType: 'audio/mpeg',
        publishedAt: '2024-01-01T12:00:00.000Z',
      },
    ]);
  });

  it('skips items without an MP3 enclosure', async () => {
    const episodes = await episodesOf([
      { title: 'AAC only', guid: 'aac', enclosure: { url: 'https://cdn.example.test/a.m4a', type: 'audio/x-m4a' } },
      { title: 'Text only', guid: 'text' },
      { title: 'MP3', guid: 'mp3', enclosure: mp3(1) },
    ]);

    expect(episodes.map((e) => e.guid)).toEqual(['mp3']);
  });

  it('picks the MP3 when an item has several enclosures', async () => {
    const cover = { url: 'https://cdn.example.test/cover.jpg', type: 'image/jpeg' };
    const [episode] = await episodesOf([{ title: 'Two enclosures', guid: 'two', enclosure: [cover, mp3(2)] }]);
    expect(episode.audioUrl).toBe('https://cdn.example.test/2.mp3');
  });

  it('uses the enclosure URL as the GUID when an item has none, so tracking stays stable', async () => {
    const [episode] = await episodesOf([{ title: 'No GUID', enclosure: mp3(7) }]);
    expect(episode.guid).toBe('https://cdn.example.test/7.mp3');
  });

  it.each([
    ['missing', undefined],
    ['unparseable', 'sometime last week'],
  ])('leaves publishedAt null when pubDate is %s', async (_case, pubDate) => {
    const [episode] = await episodesOf([{ title: 'Undated', guid: 'u', pubDate, enclosure: mp3(1) }]);
    expect(episode.publishedAt).toBeNull();
  });

  it('titles an untitled item "Untitled Episode"', async () => {
    const [episode] = await episodesOf([{ guid: 'u', enclosure: mp3(1) }]);
    expect(episode.title).toBe('Untitled Episode');
  });

  it('throws on an HTTP error status', async () => {
    const server = await startFixtureServer();
    server.route('/feed.xml', status(500));

    await expect(fetchEpisodes(server.url('/feed.xml'))).rejects.toThrow('HTTP 500 fetching feed');
  });
});
