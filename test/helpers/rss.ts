import { audio, xml, type FixtureServer } from './fixture-server.js';

export interface ItemSpec {
  title?: string;
  guid?: string;
  /** Raw <pubDate> text, exactly as a publisher would write it. */
  pubDate?: string;
  enclosure?: { url: string; type: string };
}

export interface ChannelSpec {
  title?: string;
  itunesTitle?: string;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function rssFeed(channel: ChannelSpec, items: ItemSpec[]): string {
  const tag = (name: string, value: string | undefined) =>
    value === undefined ? '' : `<${name}>${escapeXml(value)}</${name}>`;

  const itemXml = items.map((item) => {
    const enclosure = item.enclosure
      ? `<enclosure url="${escapeXml(item.enclosure.url)}" type="${escapeXml(item.enclosure.type)}" length="1024"/>`
      : '';
    return `<item>${tag('title', item.title)}${tag('guid', item.guid)}${tag('pubDate', item.pubDate)}${enclosure}</item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>${tag('title', channel.title)}${tag('itunes:title', channel.itunesTitle)}
${itemXml.join('\n')}
</channel>
</rss>`;
}

/** Bytes that are unique per label, so a test can prove which episode landed in which file. */
export function fakeMp3(label: string): Buffer {
  const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([id3Header, Buffer.from(`fake audio: ${label}\n`.repeat(64))]);
}

export interface DailyEpisode {
  guid: string;
  title: string;
  pubDate?: string;
  audioPath: string;
  body: Buffer;
}

/** Episode n of a daily show, published at noon UTC on 2024-01-n. */
export function dailyEpisode(n: number): DailyEpisode {
  const day = String(n).padStart(2, '0');
  return {
    guid: `episode-${n}`,
    title: `Episode ${n}`,
    pubDate: new Date(`2024-01-${day}T12:00:00Z`).toUTCString(),
    audioPath: `/audio/episode-${n}.mp3`,
    body: fakeMp3(`episode-${n}`),
  };
}

/**
 * Serve a podcast: the feed at `feedPath` and a healthy MP3 route per episode,
 * listed in the order given. Re-publishing replaces the feed. Returns the feed URL.
 */
export function publishPodcast(
  server: FixtureServer,
  title: string,
  episodes: DailyEpisode[],
  feedPath = '/feed.xml',
): string {
  for (const ep of episodes) server.route(ep.audioPath, audio(ep.body));
  const items = episodes.map((ep) => ({
    title: ep.title,
    guid: ep.guid,
    pubDate: ep.pubDate,
    enclosure: { url: server.url(ep.audioPath), type: 'audio/mpeg' },
  }));
  server.route(feedPath, xml(rssFeed({ title }, items)));
  return server.url(feedPath);
}
