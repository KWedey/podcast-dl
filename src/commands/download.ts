import { Command } from 'commander';
import pc from 'picocolors';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createFeedsStore } from '../state/feeds-store.js';
import { createHistoryStore } from '../state/history-store.js';
import { getFeedsPath, getHistoryPath, getDownloadsDir } from '../state/paths.js';
import { fetchEpisodes } from '../services/rss-parser.js';
import { downloadEpisode } from '../services/episode-downloader.js';
import { sanitizeFilename, sanitizeDirName, shortenTitle } from '../utils/sanitize.js';
import type { Episode } from '../types.js';

/** Maximum number of new episodes to download per feed per run */
const MAX_EPISODES_PER_FEED = 5;

/** The first item for each GUID; feeds sometimes list an episode twice. */
function uniqueByGuid(episodes: Episode[]): Episode[] {
  const byGuid = new Map<string, Episode>();
  for (const ep of episodes) {
    if (!byGuid.has(ep.guid)) byGuid.set(ep.guid, ep);
  }
  return [...byGuid.values()];
}

/**
 * Filter episodes: remove already-downloaded, take 5 most recent, return oldest-first.
 *
 * @param episodes - All episodes from the feed
 * @param feedUrl - Feed URL for history lookups
 * @param historyStore - History store instance
 * @returns Filtered episodes in oldest-first order (max 5)
 */
function filterEpisodes(
  episodes: Episode[],
  feedUrl: string,
  historyStore: ReturnType<typeof createHistoryStore>,
): { filtered: Episode[]; skipped: Episode[] } {
  const skipped: Episode[] = [];
  const candidates: Episode[] = [];
  // One read per feed: each store call reads and checks the whole history file.
  const downloaded = new Set(historyStore.getDownloadedGuids(feedUrl));

  for (const ep of episodes) {
    if (downloaded.has(ep.guid)) {
      skipped.push(ep);
    } else {
      candidates.push(ep);
    }
  }

  // Sort by publishedAt descending (newest first); null dates sort to end
  candidates.sort((a, b) => {
    if (a.publishedAt === null && b.publishedAt === null) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Take first 5 (most recent), then reverse for oldest-first download order
  const selected = candidates.slice(0, MAX_EPISODES_PER_FEED).reverse();

  return { filtered: selected, skipped };
}

/** <podcastDir>/<YYYY-MM-DD>_<Episode Title>.mp3, before collision handling. */
function baseEpisodePath(podcastDir: string, episode: Episode): string {
  const datePrefix = episode.publishedAt
    ? new Date(episode.publishedAt).toISOString().slice(0, 10)
    : 'unknown-date';
  const sanitizedTitle = shortenTitle(sanitizeFilename(episode.title));
  const filename = `${datePrefix}_${sanitizedTitle}.mp3`;
  return join(podcastDir, filename);
}

/**
 * Destination paths for a feed's episodes. Two items whose names collide within
 * the feed (same day, titles equal once cut) each get a short hash of their GUID.
 * The path depends only on the feed, never on what is on disk, so an episode
 * maps to the same file on every run.
 */
function episodePaths(
  downloadsDir: string,
  feedName: string,
  episodes: Episode[],
): (episode: Episode) => string {
  const podcastDir = join(downloadsDir, sanitizeDirName(feedName));
  const counts = new Map<string, number>();
  for (const ep of episodes) {
    const path = baseEpisodePath(podcastDir, ep);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return (episode) => {
    const path = baseEpisodePath(podcastDir, episode);
    if (counts.get(path) === 1) return path;
    const hash = createHash('sha256').update(episode.guid).digest('hex').slice(0, 6);
    return `${path.slice(0, -'.mp3'.length)} (${hash}).mp3`;
  };
}

/**
 * Register the "download" subcommand for downloading new podcast episodes.
 * Fetches RSS for all subscribed feeds, filters to 5 most recent un-downloaded
 * episodes per feed, downloads with retry, updates history, and displays progress.
 */
export function registerDownloadCommand(program: Command): void {
  program
    .command('download')
    .description('Download new episodes from all subscribed feeds')
    .action(async () => {
      const feedsStore = createFeedsStore(getFeedsPath());
      const historyStore = createHistoryStore(getHistoryPath());
      const downloadsDir = getDownloadsDir();

      const feeds = feedsStore.getAll();

      // No feeds subscribed
      if (feeds.length === 0) {
        console.log(
          pc.yellow('No feeds subscribed. Use "podcast-dl add <url>" to get started.'),
        );
        return;
      }

      // Sort feeds alphabetically by name
      feeds.sort((a, b) => a.name.localeCompare(b.name));

      // Counters
      let totalDownloaded = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let feedsReached = 0;
      const failedEpisodes: Array<{ feed: string; title: string }> = [];
      const unrecordedEpisodes: Array<{ feed: string; title: string }> = [];

      /** Run a history write; on failure, return its error so the run can carry on. */
      const recordInHistory = (write: () => void): string | undefined => {
        try {
          write();
          return undefined;
        } catch (error: unknown) {
          return error instanceof Error ? error.message : 'Unknown error';
        }
      };

      // Process each feed sequentially
      for (const feed of feeds) {
        console.log(`\n${pc.bold(pc.cyan(feed.name))}`);

        // Fetch episodes
        let episodes: Episode[];
        try {
          episodes = await fetchEpisodes(feed.url);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.log(`  ${pc.red(`Error fetching feed: ${message}`)}`);
          continue;
        }

        feedsReached++;

        const unique = uniqueByGuid(episodes);
        const pathOf = episodePaths(downloadsDir, feed.name, unique);
        const { filtered, skipped } = filterEpisodes(unique, feed.url, historyStore);

        // Log skipped episodes
        for (const ep of skipped) {
          console.log(pc.dim(`  Skipping: ${ep.title} (already downloaded)`));
        }
        totalSkipped += skipped.length;

        // No new episodes
        if (filtered.length === 0) {
          console.log(pc.dim('  No new episodes'));
          continue;
        }

        // Download each episode sequentially
        for (const episode of filtered) {
          const destPath = pathOf(episode);

          console.log(`  Downloading: ${episode.title}...`);

          // First attempt
          let result = await downloadEpisode(episode.audioUrl, destPath);

          // Retry once on failure
          if (!result.success) {
            result = await downloadEpisode(episode.audioUrl, destPath);
          }

          if (result.success) {
            totalDownloaded++;
            const historyError = recordInHistory(() => historyStore.markDownloaded(feed.url, episode.guid));
            if (historyError === undefined) {
              console.log(pc.green(`  Downloaded: ${episode.title}`));
            } else {
              console.log(
                pc.yellow(`  Downloaded: ${episode.title}, but could not record it in history (${historyError})`),
              );
              unrecordedEpisodes.push({ feed: feed.name, title: episode.title });
            }
          } else {
            totalFailed++;
            failedEpisodes.push({ feed: feed.name, title: episode.title });
            console.log(pc.red(`  Failed: ${episode.title} (${result.error})`));
            const historyError = recordInHistory(() => historyStore.markFailed(feed.url, episode.guid));
            if (historyError !== undefined) {
              console.log(pc.red(`    Could not record this failure in history (${historyError})`));
              unrecordedEpisodes.push({ feed: feed.name, title: episode.title });
            }
          }
        }
      }

      // All feeds unreachable
      if (feedsReached === 0 && feeds.length > 0) {
        console.log(
          pc.bold(pc.red('\nNo feeds could be reached -- check your connection')),
        );
      }

      // End-of-run summary
      console.log(`\n${pc.bold('Summary')}`);
      console.log(`  Downloaded: ${pc.green(String(totalDownloaded))}`);
      console.log(`  Skipped:    ${pc.dim(String(totalSkipped))}`);
      console.log(
        `  Failed:     ${totalFailed > 0 ? pc.red(String(totalFailed)) : pc.dim('0')}`,
      );
      const feedsFailed = feeds.length - feedsReached;
      if (feedsFailed > 0) {
        console.log(`  Feeds failed: ${pc.red(String(feedsFailed))}`);
      }
      if (unrecordedEpisodes.length > 0) {
        console.log(`  History errors: ${pc.red(String(unrecordedEpisodes.length))}`);
      }

      if (failedEpisodes.length > 0) {
        console.log(pc.red('\nFailed episodes:'));
        for (const ep of failedEpisodes) {
          console.log(`  - ${ep.feed}: ${ep.title}`);
        }
      }

      if (unrecordedEpisodes.length > 0) {
        console.log(pc.yellow(`\nNot recorded in ${getHistoryPath()}, so the next run fetches these again:`));
        for (const ep of unrecordedEpisodes) {
          console.log(`  - ${ep.feed}: ${ep.title}`);
        }
      }

      // A feed that could not be fetched is a failure too, so scripts never mistake an offline run for success
      if (totalFailed > 0 || feedsFailed > 0 || unrecordedEpisodes.length > 0) {
        process.exit(1);
      }
    });
}
