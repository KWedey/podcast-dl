import { parseFeed } from 'feedsmith';
import type { Episode } from '../types.js';

/**
 * Fetch an RSS feed and extract podcast episodes with audio/mpeg enclosures.
 *
 * Only episodes with audio/mpeg enclosures are returned -- other audio formats
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
  const { feed } = parseFeed(content);

  // feedsmith returns format-specific structure; access items from the parsed feed
  const rssFeed = feed as Record<string, unknown>;
  const items =
    (rssFeed.items as Array<Record<string, unknown>>) ??
    (rssFeed.entries as Array<Record<string, unknown>>) ??
    [];

  const episodes: Episode[] = [];

  for (const item of items) {
    const enclosures = item.enclosures as
      | Array<{ url?: string; type?: string; length?: number }>
      | undefined;

    // Only accept audio/mpeg enclosures (MP3-compatible)
    const audioEnclosure = enclosures?.find(
      (e) => e.type === 'audio/mpeg' && e.url,
    );

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
