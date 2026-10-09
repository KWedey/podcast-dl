import { parseFeed } from 'feedsmith';
import { extractEpisodes } from './rss-parser.js';

/**
 * Validate that a URL points to a podcast RSS feed with at least one MP3 episode.
 * Fetches the URL, parses it with feedsmith, and checks for downloadable episodes.
 *
 * @returns The podcast title extracted from the feed
 * @throws If the URL is unreachable, not a valid feed, or has no MP3 episodes
 */
export async function validateFeed(url: string): Promise<{ title: string }> {
  // 1. Fetch the URL
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Request timed out');
    }
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch URL: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  // 2. Parse the response with feedsmith
  const content = await response.text();
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(content);
  } catch {
    throw new Error('URL is not a valid RSS or Atom feed');
  }

  // 3. Require at least one episode the download command can fetch
  if (extractEpisodes(parsed.feed).length === 0) {
    throw new Error(
      'Feed has no MP3 episodes (RSS <enclosure type="audio/mpeg">). Only MP3 podcast feeds are supported.',
    );
  }

  // 4. Extract and return the podcast title
  const feed = parsed.feed as Record<string, unknown>;
  const itunes = feed.itunes as Record<string, unknown> | undefined;
  let title =
    (feed.title as string) ?? (itunes?.title as string) ?? 'Untitled Podcast';

  if (title === '') {
    title = 'Untitled Podcast';
  }

  return { title };
}
