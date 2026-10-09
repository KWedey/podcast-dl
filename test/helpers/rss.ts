import { audio, xml, type FixtureServer } from './fixture-server.js';

export interface Enclosure {
  url: string;
  type: string;
}

export interface ItemSpec {
  title?: string;
  guid?: string;
  /** Raw <pubDate> text, exactly as a publisher would write it. */
  pubDate?: string;
  enclosure?: Enclosure | Enclosure[];
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
    const enclosures = [item.enclosure ?? []]
      .flat()
      .map((e) => `<enclosure url="${escapeXml(e.url)}" type="${escapeXml(e.type)}" length="1024"/>`)
      .join('');
    return `<item>${tag('title', item.title)}${tag('guid', item.guid)}${tag('pubDate', item.pubDate)}${enclosures}</item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>${tag('title', channel.title)}${tag('itunes:title', channel.itunesTitle)}
${itemXml.join('\n')}
</channel>
</rss>`;
}

/** An Atom feed with one MP3 enclosure: a real podcast, in a format the CLI does not read. */
export function atomFeed(title: string, audioUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeXml(title)}</title><id>urn:show</id><updated>2024-01-01T00:00:00Z</updated>
<entry><title>Episode 1</title><id>urn:ep1</id><updated>2024-01-01T00:00:00Z</updated>
<link rel="enclosure" type="audio/mpeg" href="${escapeXml(audioUrl)}"/></entry></feed>`;
}

/** Bytes that are unique per label, so a test can prove which episode landed in which file. */
export function fakeMp3(label: string): Buffer {
  const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([id3Header, Buffer.from(`fake audio: ${label}\n`.repeat(64))]);
}

export interface FixtureEpisode {
  guid: string;
  title: string;
  /** Raw <pubDate> text; omitted means the item has none. */
  pubDate?: string;
  audioPath: string;
  body: Buffer;
}

/** An episode published at noon UTC on `date` (YYYY-MM-DD). The GUID defaults to one derived from the title. */
export function episode(date: string, title: string, guid?: string): FixtureEpisode {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    guid: guid ?? `urn:test:${slug}`,
    title,
    pubDate: new Date(`${date}T12:00:00Z`).toUTCString(),
    audioPath: `/audio/${slug}.mp3`,
    body: fakeMp3(slug),
  };
}

/** Episode n of a daily show: "Episode n", published 2024-01-n. */
export function dailyEpisode(n: number): FixtureEpisode {
  return episode(`2024-01-${String(n).padStart(2, '0')}`, `Episode ${n}`);
}

/**
 * Serve a podcast: the feed at `feedPath` plus a healthy MP3 route for each
 * episode that has no route yet, so custom handlers survive re-publishing.
 * Items are listed in the order given. Returns the feed URL.
 */
export function publishPodcast(
  server: FixtureServer,
  title: string,
  episodes: FixtureEpisode[],
  feedPath = '/feed.xml',
): string {
  for (const ep of episodes) {
    if (!server.isRouted(ep.audioPath)) server.route(ep.audioPath, audio(ep.body));
  }
  const items = episodes.map((ep) => ({
    title: ep.title,
    guid: ep.guid,
    pubDate: ep.pubDate,
    enclosure: { url: server.url(ep.audioPath), type: 'audio/mpeg' },
  }));
  server.route(feedPath, xml(rssFeed({ title }, items)));
  return server.url(feedPath);
}
