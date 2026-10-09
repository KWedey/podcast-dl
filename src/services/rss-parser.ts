import { parseFeed } from 'feedsmith';
import type { Episode } from '../types.js';

/** audio/mpeg is the registered MP3 type; the rest are spellings real feeds use. */
const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mp3', 'audio/x-mpeg']);

function isMp3MimeType(type: string | undefined): boolean {
  return type !== undefined && MP3_MIME_TYPES.has(type.split(';')[0].trim().toLowerCase());
}

/**
 * Fetch an RSS feed and extract podcast episodes with MP3 enclosures.
 *
 * Only episodes with MP3 enclosures are returned -- other audio formats
 * (M4A, OGG, etc.) are skipped to ensure MP3 compatibility.
 *
 * @param url - RSS feed URL
 * @returns Array of episodes extracted from the feed
 * @throws If the feed cannot be fetched or parsed
 */
export async function fetchEpisodes(url: string): Promise<Episode[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'podcast-dl/0.1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching feed`);
  }

  const content = await response.text();
  return extractEpisodes(parseFeed(content).feed);
}

/** Pull the downloadable episodes out of a parsed RSS feed: items with an MP3 enclosure. */
export function extractEpisodes(feed: unknown): Episode[] {
  const items = ((feed as Record<string, unknown>).items as Array<Record<string, unknown>>) ?? [];

  const episodes: Episode[] = [];

  for (const item of items) {
    const enclosures = item.enclosures as
      | Array<{ url?: string; type?: string; length?: number }>
      | undefined;

    const audioEnclosure = enclosures?.find((e) => isMp3MimeType(e.type) && e.url);

    if (!audioEnclosure?.url) continue;

    // Extract GUID, falling back to enclosure URL if guid is missing
    const guid = item.guid as { value?: string } | undefined;
    const guidValue = guid?.value ?? audioEnclosure.url;

    // Extract title, defaulting to 'Untitled Episode'
    const title = (item.title as string) ?? 'Untitled Episode';

    episodes.push({
      guid: guidValue,
      title,
      audioUrl: audioEnclosure.url,
      mimeType: audioEnclosure.type ?? 'audio/mpeg',
      publishedAt: parsePubDate(item.pubDate as string | undefined),
    });
  }

  return episodes;
}

/**
 * Parse an RSS pubDate string into an ISO 8601 string.
 * Returns null if the date is missing or invalid.
 */
function parsePubDate(pubDate: string | undefined | null): string | null {
  if (!pubDate) return null;
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
