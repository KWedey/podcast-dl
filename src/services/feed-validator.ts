import { parseFeed } from 'feedsmith';

/**
 * Validate that a URL points to a podcast RSS/Atom feed with audio enclosures.
 * Fetches the URL, parses it with feedsmith, and checks for audio content.
 *
 * @returns The podcast title extracted from the feed
 * @throws If the URL is unreachable, not a valid feed, or has no audio enclosures
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

  // 3. Validate audio enclosures exist
  const feed = parsed.feed as Record<string, unknown>;
  const items = (feed.items as unknown[]) ?? (feed.entries as unknown[]) ?? [];

  const hasAudio = items.some((item: unknown) => {
    const entry = item as Record<string, unknown>;

    // RSS: items have enclosures array
    const enclosures = entry.enclosures as
      | Array<{ type?: string }>
      | undefined;
    if (enclosures?.some((e) => e.type?.startsWith('audio/'))) {
      return true;
    }

    // Atom: entries have links array
    const links = entry.links as
      | Array<{ type?: string; rel?: string }>
      | undefined;
    if (
      links?.some((l) => l.type?.startsWith('audio/') && l.rel === 'enclosure')
    ) {
      return true;
    }

    return false;
  });

  if (!hasAudio) {
    throw new Error(
      'Feed is valid RSS but contains no audio enclosures. Only podcast feeds with audio content are supported.',
    );
  }

  // 4. Extract and return the podcast title
  const itunes = feed.itunes as Record<string, unknown> | undefined;
  let title =
    (feed.title as string) ?? (itunes?.title as string) ?? 'Untitled Podcast';

  if (title === '') {
    title = 'Untitled Podcast';
  }

  return { title };
}
