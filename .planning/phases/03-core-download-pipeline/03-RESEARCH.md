# Phase 3: Core Download Pipeline - Research

**Researched:** 2026-02-17
**Domain:** RSS episode extraction (feedsmith), HTTP streaming downloads (native fetch + Node.js streams), episode filtering, history state tracking with failed state, CLI download command orchestration
**Confidence:** HIGH

## Summary

Phase 3 is the culmination of the project -- it wires together the feeds store (Phase 1), history store (Phase 1), feed validation/parsing (Phase 2), and new download logic into a single `podcast-dl download` command. The command fetches RSS for all subscribed feeds, extracts episodes, filters against download history, and streams new episodes to disk as MP3 files organized by podcast.

The technical domain breaks into five areas: (1) RSS episode extraction using feedsmith's typed API to pull guid, title, pubDate, and enclosure data from parsed feeds; (2) episode filtering that selects up to 5 most recent un-downloaded episodes per feed using GUID-based history; (3) HTTP streaming downloads using Node.js native `fetch` + `Readable.fromWeb()` + `pipeline()` + `createWriteStream()` to stream large audio files to disk without buffering; (4) temp file + rename pattern to prevent incomplete downloads from being treated as complete; (5) history store enhancement to support a "failed" state distinct from "downloaded" so failed episodes are automatically retried on the next run.

The existing codebase provides solid foundations: `createFeedsStore` for reading subscribed feeds, `createHistoryStore` for GUID tracking, `sanitizeFilename` and `sanitizeDirName` for filesystem-safe naming, `validateFeed` for RSS fetching and parsing (reusable pattern), and the `registerXCommand(program)` pattern for CLI command registration. The primary new code is the download pipeline orchestrator, the episode extraction service, the file downloader service, and the download command handler.

**Primary recommendation:** Build a linear pipeline: read feeds -> for each feed, fetch RSS and extract episodes -> filter against history -> download oldest-first with temp file + rename -> update history after each download. Use simple `console.log` lines for progress (no progress bars). Enhance the history store to track `{ status: "downloaded" | "failed" }` per GUID instead of bare string arrays.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Console output
- Output grouped by feed: feed name as header, episodes indented beneath
- Show skipped episodes inline ("Skipping: Episode Title (already downloaded)")
- End-of-run summary with totals: downloaded, skipped, failed
- Failed episodes listed by name in the summary, not just a count

#### Episode file naming
- Date-prefixed: `YYYY-MM-DD_Episode-Title.mp3`
- Date comes from RSS pubDate (episode publish date, not download date)
- No episode number in filename -- date + title only
- Long titles truncated at ~80 characters
- Sanitization already handled by existing utility from Phase 1

#### Failure handling
- Unreachable feed: log error, skip feed, continue to next feed
- Failed episode download: retry once, then skip and continue
- Failed episodes marked as "failed" in history (distinct from "downloaded")
- Successful retry on next run clears the failed state -- upgrades to downloaded
- No `--retry-failed` flag for v1 -- just re-run `download` (failed episodes are retried automatically)
- Total failure (all feeds unreachable): distinct error message ("No feeds could be reached -- check your connection")
- Exit code non-zero if any downloads failed -- useful for scripts/automation

#### Multi-feed ordering
- Feeds processed alphabetically by podcast name (matches `list` command order)
- Sequential downloads -- one episode at a time
- Within a feed, episodes download oldest-first (chronological)
- When no new episodes exist: show per-feed status confirming each feed was checked

### Claude's Discretion
- Console output detail level (progress bars vs simple lines)
- Exact error message wording
- HTTP streaming implementation details
- Temp file naming convention

### Deferred Ideas (OUT OF SCOPE)
- `--retry-failed` flag to only retry failed episodes -- not needed for v1, re-running download handles it
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DL-01 | Tool downloads audio enclosures from RSS feeds as MP3 files | feedsmith `parseRssFeed()` extracts `item.enclosures[].url` and `item.enclosures[].type`. Filter for `audio/mpeg` type. Use native `fetch` + `Readable.fromWeb()` + `pipeline()` + `createWriteStream()` to stream to disk. |
| DL-02 | Downloads organized into `downloads/<PodcastName>/episode.mp3` folder structure | Use existing `sanitizeDirName(feed.name)` for podcast folder name. Construct path as `downloads/<sanitized-name>/YYYY-MM-DD_<sanitized-title>.mp3`. Create directories with `mkdirSync({ recursive: true })`. |
| DL-03 | Tool downloads up to 5 most recent un-downloaded episodes per feed | Sort parsed episodes by pubDate descending, filter out GUIDs already in history (status "downloaded"), take first 5, then reverse to download oldest-first per user decision. Failed episodes are NOT filtered out -- they are retried. |
| DL-04 | Downloads use streaming (not buffering entire file in memory) | `Readable.fromWeb(response.body)` converts fetch's Web ReadableStream to Node.js Readable, piped via `pipeline()` to `createWriteStream()`. Memory usage stays constant regardless of file size. |
| DL-05 | Incomplete downloads not treated as complete (temp file + rename) | Download to `<filename>.mp3.tmp`, rename to `<filename>.mp3` only after pipeline completes successfully. On error, delete the `.tmp` file. Never mark GUID as downloaded until rename succeeds. |
| CLI-01 | Single `download` command checks all feeds and downloads new episodes | Register `download` command via `registerDownloadCommand(program)` pattern consistent with existing commands. Command orchestrates the full pipeline: read feeds, fetch RSS, filter, download, update history. |
| CLI-03 | Console output shows which episodes are being downloaded | Per-feed header with feed name, per-episode status lines (downloading, done, skipped, failed), end-of-run summary with totals. Uses picocolors for colored output. |
</phase_requirements>

## Standard Stack

### Core (Phase 3 additions -- no new npm dependencies)

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Native `fetch` | Built-in (Node 22+) | HTTP requests for RSS XML and audio file downloads | Follows redirects by default (handles podcast CDN redirect chains). `response.body` provides Web ReadableStream for streaming. |
| `node:stream` `Readable.fromWeb()` | Built-in (Node 22+) | Convert Web ReadableStream to Node.js Readable | Required bridge between fetch's Web Streams and Node.js file I/O. |
| `node:stream/promises` `pipeline()` | Built-in | Safe stream piping with backpressure and cleanup | Handles error propagation, stream cleanup, and backpressure automatically. Returns Promise for async/await usage. |
| `node:fs` `createWriteStream()` | Built-in | Write downloaded audio to disk | Stream destination for pipeline. Combined with temp file pattern for safety. |
| `node:fs/promises` `rename()`, `unlink()`, `mkdir()` | Built-in | File operations for temp-rename and directory creation | Async versions for the download pipeline. `rename` is atomic on POSIX. |

### From Phase 1 & 2 (consumed, not installed)

| Module | Provides | Used By |
|--------|----------|---------|
| `src/state/feeds-store.ts` | `createFeedsStore()` with `getAll()` | Download command reads subscribed feeds |
| `src/state/history-store.ts` | `createHistoryStore()` with `isDownloaded()`, `markDownloaded()`, `getDownloadedGuids()` | Episode filtering and post-download tracking (requires enhancement for "failed" state) |
| `src/state/paths.ts` | `getFeedsPath()`, `getHistoryPath()` | Download command creates store instances |
| `src/utils/sanitize.ts` | `sanitizeFilename()`, `sanitizeDirName()` | Episode filename and podcast folder name generation |
| `src/services/feed-validator.ts` | `validateFeed()` -- pattern reference | Episode extraction service follows same fetch + parse pattern |
| `src/types.ts` | `Feed`, `Episode`, `DownloadHistory` | Type definitions (DownloadHistory needs migration for status tracking) |

### No New Dependencies

Phase 3 requires zero new npm packages. Everything is built on:
- Native Node.js APIs (fetch, streams, fs)
- feedsmith (already installed) for RSS parsing
- picocolors (already installed) for console output
- Existing state stores and utilities from Phases 1 and 2

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` + streams | `got` library with stream support | Got provides retry, progress events, and stream helpers built-in. But adds a dependency for features we can build in ~10 lines. Native fetch is sufficient. |
| Simple console.log progress | `ora` spinner or `cli-progress` bar | Progress bars require knowing total file size (Content-Length header), which not all CDNs provide. Simple "Downloading: Episode Title..." lines are reliable and match the user decision for simple output. |
| Manual temp file management | `tempfile` or `tmp` package | Temp file is always in the same directory as the final file (avoids EXDEV cross-device errors). Pattern is 3 lines of code. No package needed. |

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
src/
├── cli.ts                        # Add registerDownloadCommand (existing)
├── commands/
│   ├── add.ts                    # (existing)
│   ├── remove.ts                 # (existing)
│   ├── list.ts                   # (existing)
│   └── download.ts               # NEW: download command handler + orchestrator
├── services/
│   ├── feed-validator.ts         # (existing)
│   ├── rss-parser.ts             # NEW: fetch RSS + extract Episode[] from feed
│   └── episode-downloader.ts     # NEW: stream single episode to disk with temp+rename
├── state/
│   ├── feeds-store.ts            # (existing)
│   ├── history-store.ts          # MODIFIED: add "failed" status tracking
│   ├── atomic-write.ts           # (existing)
│   └── paths.ts                  # MODIFIED: add getDownloadsDir()
├── types.ts                      # MODIFIED: update DownloadHistory type for status
└── utils/
    └── sanitize.ts               # (existing)
```

### Pattern 1: Download Pipeline Orchestrator

**What:** The `download` command handler orchestrates the full pipeline: read feeds, fetch RSS for each, extract episodes, filter against history, download each episode, update history. It is a thin orchestrator that delegates each step to a service function.

**When to use:** The `download` command -- the core of Phase 3.

**Why:** Keeps the command handler focused on orchestration and console output. Each service is independently testable. The pipeline is linear and easy to debug.

**Example:**
```typescript
// src/commands/download.ts
import { Command } from 'commander';
import pc from 'picocolors';
import { createFeedsStore } from '../state/feeds-store.js';
import { createHistoryStore } from '../state/history-store.js';
import { getFeedsPath, getHistoryPath, getDownloadsDir } from '../state/paths.js';
import { fetchEpisodes } from '../services/rss-parser.js';
import { downloadEpisode } from '../services/episode-downloader.js';
import type { Episode } from '../types.js';

const MAX_EPISODES_PER_FEED = 5;

export function registerDownloadCommand(program: Command): void {
  program
    .command('download')
    .description('Download new episodes from all subscribed feeds')
    .action(async () => {
      const feedsStore = createFeedsStore(getFeedsPath());
      const historyStore = createHistoryStore(getHistoryPath());
      const downloadsDir = getDownloadsDir();

      const feeds = feedsStore.getAll();
      if (feeds.length === 0) {
        console.log(pc.yellow('No feeds subscribed. Use "podcast-dl add <url>" to get started.'));
        return;
      }

      // Sort alphabetically to match list command order
      feeds.sort((a, b) => a.name.localeCompare(b.name));

      let totalDownloaded = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const failedEpisodes: string[] = [];
      let feedsReached = 0;

      for (const feed of feeds) {
        console.log(`\n${pc.bold(pc.cyan(feed.name))}`);

        // Fetch and parse RSS
        let episodes: Episode[];
        try {
          episodes = await fetchEpisodes(feed.url);
          feedsReached++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          console.log(`  ${pc.red(`Error: ${msg}`)}`);
          continue;
        }

        // Filter: remove downloaded, keep failed (for retry), take 5 most recent
        const newEpisodes = filterEpisodes(episodes, feed.url, historyStore);

        if (newEpisodes.length === 0) {
          console.log(`  ${pc.dim('No new episodes')}`);
          continue;
        }

        // Download oldest-first (reversed from the most-recent-first selection)
        for (const episode of newEpisodes) {
          // ... download with retry, update history, console output
        }
      }

      // End-of-run summary
      // ... print totals and failed episode names

      // Exit code
      if (totalFailed > 0) {
        process.exit(1);
      }
    });
}
```

### Pattern 2: Episode Extraction Service

**What:** A service function that fetches RSS XML from a feed URL, parses it with feedsmith, and returns an array of `Episode` objects with guid, title, audioUrl, mimeType, and publishedAt extracted from the parsed feed items.

**When to use:** Called by the download orchestrator for each feed.

**Why:** Isolates RSS parsing and episode extraction from the download logic. The existing `validateFeed` service demonstrates the fetch + parse pattern; this service extends it to extract episode-level data.

**Example:**
```typescript
// src/services/rss-parser.ts
import { parseFeed } from 'feedsmith';
import type { Episode } from '../types.js';

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

  // feedsmith returns format-specific structure
  // Access items from the parsed feed
  const rssFeed = feed as Record<string, unknown>;
  const items = (rssFeed.items as Array<Record<string, unknown>>) ?? [];

  const episodes: Episode[] = [];

  for (const item of items) {
    const enclosures = item.enclosures as Array<{
      url?: string;
      type?: string;
      length?: number;
    }> | undefined;

    // Find the first audio enclosure
    const audioEnclosure = enclosures?.find(
      (e) => e.type?.startsWith('audio/') && e.url
    );

    if (!audioEnclosure?.url) continue;

    const guid = item.guid as { value?: string } | undefined;
    const guidValue = guid?.value ?? audioEnclosure.url; // Fallback to URL

    episodes.push({
      guid: guidValue,
      title: (item.title as string) ?? 'Untitled Episode',
      audioUrl: audioEnclosure.url,
      mimeType: audioEnclosure.type ?? 'audio/mpeg',
      publishedAt: parsePubDate(item.pubDate as string | undefined),
    });
  }

  return episodes;
}

function parsePubDate(pubDate: string | undefined | null): string | null {
  if (!pubDate) return null;
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}
```

### Pattern 3: Streaming File Download with Temp + Rename

**What:** Download an audio file by streaming the HTTP response body directly to a temporary file on disk, then rename the temp file to the final path only after the download completes successfully. If the download fails, delete the temp file.

**When to use:** Every episode download.

**Why:** Prevents incomplete files from being treated as complete. If the process crashes mid-download, only a `.tmp` file is left -- never a partial `.mp3`. The rename is atomic on POSIX systems.

**Example:**
```typescript
// src/services/episode-downloader.ts
import { createWriteStream } from 'node:fs';
import { rename, unlink, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import type { ReadableStream } from 'node:stream/web';

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export async function downloadEpisode(
  audioUrl: string,
  destPath: string,
): Promise<DownloadResult> {
  const tmpPath = destPath + '.tmp';

  // Ensure parent directory exists
  await mkdir(dirname(destPath), { recursive: true });

  try {
    const response = await fetch(audioUrl, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: AbortSignal.timeout(300_000), // 5 min timeout for large files
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    if (!response.body) {
      return { success: false, error: 'No response body' };
    }

    // Stream to temp file
    const nodeReadable = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>
    );
    const writeStream = createWriteStream(tmpPath);
    await pipeline(nodeReadable, writeStream);

    // Atomic rename: temp -> final
    await rename(tmpPath, destPath);

    return { success: true };
  } catch (error) {
    // Clean up temp file on failure
    try {
      await unlink(tmpPath);
    } catch {
      // Temp file may not exist if fetch failed before writing
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
```

### Pattern 4: Episode Filtering with "5 Most Recent Un-downloaded"

**What:** Given all episodes from a feed, filter out already-downloaded GUIDs, sort by publication date descending (newest first), take the first 5, then reverse to download oldest-first.

**When to use:** Before downloading episodes for each feed.

**Why:** Implements DL-03 (limit to 5 most recent un-downloaded). Failed episodes are NOT filtered out -- they are retried. The oldest-first download order is a user decision for chronological listening.

**Example:**
```typescript
function filterEpisodes(
  episodes: Episode[],
  feedUrl: string,
  historyStore: ReturnType<typeof createHistoryStore>,
): Episode[] {
  // Filter out episodes that are already downloaded (but keep failed ones)
  const undownloaded = episodes.filter(
    (ep) => !historyStore.isDownloaded(feedUrl, ep.guid)
  );

  // Sort by pubDate descending (newest first) for selection
  undownloaded.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;  // No date goes to end
    if (!b.publishedAt) return -1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  // Take 5 most recent, then reverse for oldest-first download order
  const selected = undownloaded.slice(0, MAX_EPISODES_PER_FEED);
  selected.reverse();

  return selected;
}
```

### Pattern 5: History Store Enhancement for Failed State

**What:** Enhance the existing history store to track episode status as `"downloaded"` or `"failed"` instead of bare GUID strings. `isDownloaded()` returns true only for `"downloaded"` status. Failed episodes are retried on the next run.

**When to use:** The history store mutation is required to support the user's failure handling decisions.

**Why the current store needs changing:** The current `DownloadHistory` type is `Record<string, string[]>` -- an array of GUID strings per feed. This cannot distinguish between "downloaded successfully" and "failed." The user explicitly decided: "Failed episodes marked as 'failed' in history (distinct from 'downloaded')" and "Successful retry on next run clears the failed state."

**Migration approach:** Change from `string[]` (array of GUIDs) to `Array<{ guid: string; status: "downloaded" | "failed" }>`. The `isDownloaded()` method filters for `status === "downloaded"`. A new `isFailed()` method checks for `status === "failed"`. `markDownloaded()` upserts to `"downloaded"` status (clearing any prior `"failed"` state). A new `markFailed()` method sets `"failed"` status.

**Backward compatibility:** The store's `readAll()` can detect the old format (array of strings) and migrate it to the new format on read, ensuring existing history.json files work without manual migration.

**Example:**
```typescript
// Updated types.ts
export interface HistoryEntry {
  guid: string;
  status: 'downloaded' | 'failed';
}

export type DownloadHistory = Record<string, HistoryEntry[]>;

// Updated history-store.ts additions
return {
  isDownloaded(feedUrl: string, guid: string): boolean {
    const entries = getEntries(feedUrl);
    return entries.some((e) => e.guid === guid && e.status === 'downloaded');
  },

  isFailed(feedUrl: string, guid: string): boolean {
    const entries = getEntries(feedUrl);
    return entries.some((e) => e.guid === guid && e.status === 'failed');
  },

  markDownloaded(feedUrl: string, guid: string): void {
    upsertEntry(feedUrl, guid, 'downloaded');
  },

  markFailed(feedUrl: string, guid: string): void {
    upsertEntry(feedUrl, guid, 'failed');
  },
};
```

### Pattern 6: Episode Filename Construction

**What:** Construct the filename from pubDate + sanitized title: `YYYY-MM-DD_Episode-Title.mp3`. If no pubDate, use `unknown-date` as prefix. Truncate title at ~80 characters per user decision.

**When to use:** Before every download to determine the destination file path.

**Example:**
```typescript
import { sanitizeFilename, sanitizeDirName } from '../utils/sanitize.js';
import { join } from 'node:path';

function buildEpisodePath(
  downloadsDir: string,
  podcastName: string,
  episode: Episode,
): string {
  const dirName = sanitizeDirName(podcastName);

  // Date prefix from pubDate
  const datePrefix = episode.publishedAt
    ? new Date(episode.publishedAt).toISOString().slice(0, 10) // YYYY-MM-DD
    : 'unknown-date';

  // Sanitize and truncate title
  const sanitizedTitle = sanitizeFilename(episode.title);
  const truncatedTitle = sanitizedTitle.slice(0, 80);

  const filename = `${datePrefix}_${truncatedTitle}.mp3`;

  return join(downloadsDir, dirName, filename);
}
```

### Anti-Patterns to Avoid

- **Buffering entire audio file in memory with `response.arrayBuffer()`:** A 60-minute podcast episode is ~55MB. Buffering wastes memory and delays the write. Use streaming instead.

- **Marking episode as downloaded BEFORE the download completes:** If the process crashes during download, the episode is recorded as downloaded but the file is incomplete. Always mark downloaded AFTER the rename succeeds.

- **Using `response.body.pipe(writeStream)` without `pipeline()`:** The `pipe()` method does not propagate errors correctly. If the read stream errors, the write stream may not be cleaned up. `pipeline()` handles all cleanup.

- **Creating temp files in `/tmp` or `os.tmpdir()`:** The temp file must be in the same directory as the final file to ensure `rename()` is atomic (same filesystem). Cross-device rename fails with `EXDEV`.

- **Filtering out failed episodes during the "5 most recent" selection:** Failed episodes should be retried, not skipped. The filter should exclude only `"downloaded"` GUIDs, not `"failed"` ones.

- **Sorting episodes by feed XML order instead of pubDate:** Feed XML ordering is inconsistent across publishers. Always sort by parsed `pubDate` for reliable "most recent" selection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS feed parsing / episode extraction | Custom XML parsing or regex | feedsmith `parseFeed()` | Feed XML varies wildly across publishers. feedsmith handles RSS, Atom, RDF with namespace support (iTunes, Podcast, Media). Tested against thousands of real feeds. |
| Stream piping with error handling | Manual `.pipe()` with `.on('error')` | `pipeline()` from `node:stream/promises` | `pipeline()` destroys all streams on error, prevents memory leaks, handles backpressure. Manual pipe requires 6+ error handlers to be correct. |
| Web-to-Node stream conversion | Manual ReadableStream consumption | `Readable.fromWeb()` | Native bridge handles buffering, backpressure, and error propagation between Web Streams and Node.js streams. |
| Filename sanitization | Regex for special chars | Existing `sanitizeFilename()` from Phase 1 | Already built and tested. Uses `filenamify` which handles the full matrix of reserved characters. |
| Date parsing from RSS pubDate | Custom date parsing | `new Date(pubDate)` constructor | JavaScript's Date constructor natively parses RFC 822 dates (the format used in RSS `<pubDate>`). No library needed. |

**Key insight:** Phase 3 adds no new npm dependencies. Every technical need is met by native Node.js APIs (fetch, streams, fs) combined with already-installed libraries (feedsmith, picocolors) and utilities built in Phases 1-2.

## Common Pitfalls

### Pitfall 1: TypeScript Type Mismatch with Readable.fromWeb()

**What goes wrong:** `Readable.fromWeb(response.body)` produces a TypeScript error because `response.body` is typed as `ReadableStream<Uint8Array>` (Web API type) but `Readable.fromWeb()` expects the Node.js `ReadableStream` type. These types are structurally identical but nominally different in TypeScript.

**Why it happens:** Known incompatibility between Web API and Node.js stream type definitions (nodejs/node#53119, DefinitelyTyped/DefinitelyTyped#65542).

**How to avoid:** Use a type assertion: `Readable.fromWeb(response.body as ReadableStream<Uint8Array>)` with the Node.js `ReadableStream` type imported from `node:stream/web`.

**Warning signs:** TypeScript compile error mentioning `ReadableStream` missing `values` or `Symbol.asyncIterator` properties.

### Pitfall 2: No null check on response.body

**What goes wrong:** `response.body` can be `null` for certain response types (204 No Content, HEAD requests, etc.). Passing `null` to `Readable.fromWeb()` crashes at runtime.

**Why it happens:** The fetch spec allows `null` body for responses without content. While audio file responses should always have a body, network proxies or CDN errors might return bodiless responses.

**How to avoid:** Check `if (!response.body)` before attempting to stream. Return a failure result with a clear error message.

### Pitfall 3: Enclosure URL Redirect Chains

**What goes wrong:** Many podcast CDNs (Podtrac, Chartable, Blubrry) wrap audio URLs in tracking redirect chains (2-5 hops). If redirects are not followed, the download saves an HTML tracking page as an MP3 file.

**Why it happens:** Analytics services intercept the enclosure URL and redirect through tracking servers before reaching the actual audio file.

**How to avoid:** Native `fetch` follows redirects by default (up to 20 hops). No special configuration needed. However, set a `User-Agent` header -- some CDNs reject requests without one.

**Warning signs:** Downloaded files are suspiciously small (< 10KB) or cannot be played.

### Pitfall 4: Missing or Non-standard GUIDs

**What goes wrong:** Some feeds have missing `<guid>` elements, or use non-unique GUIDs (same GUID for every episode, or the feed URL as GUID). This breaks GUID-based deduplication.

**Why it happens:** The RSS spec makes `<guid>` optional. Some feed generators use the episode URL as GUID (which can change with CDN migrations).

**How to avoid:** Fall back to the enclosure URL as a secondary identifier if GUID is missing: `guid?.value ?? audioEnclosure.url`. Log a warning if GUID is absent so the user knows tracking may be unreliable for that feed.

### Pitfall 5: Incorrect "5 Most Recent" Selection Due to Missing pubDate

**What goes wrong:** If episodes lack `<pubDate>`, the sort is unreliable and the "5 most recent" selection may grab arbitrary episodes.

**Why it happens:** `<pubDate>` is optional in RSS. Some feeds omit it.

**How to avoid:** Sort episodes with missing dates to the end of the list (after all dated episodes). When all episodes lack dates, fall back to feed order (which is typically newest-first in most feed generators). Log a warning for feeds with missing dates.

### Pitfall 6: Download Timeout Too Short for Large Files

**What goes wrong:** A 5-minute timeout (appropriate for RSS feed fetching) kills downloads of large audio files (50-200MB on slow connections).

**Why it happens:** Using the same timeout for RSS fetches and audio downloads.

**How to avoid:** Use different timeouts: 30 seconds for RSS feed fetching (small XML payloads), 5 minutes (300 seconds) for audio file downloads. The user's connection speed determines whether 5 minutes is sufficient; this can be made configurable later if needed.

### Pitfall 7: History Written Per-Batch Instead of Per-Episode

**What goes wrong:** History is updated once after all downloads complete for a feed. If the process crashes after downloading 3 of 5 episodes, all 3 are lost from history and will be re-downloaded.

**Why it happens:** Batching writes for performance. At this scale, performance is not a concern.

**How to avoid:** Write history to disk immediately after each successful download (or failure). The atomic write utility ensures each write is crash-safe. For 1-25 episodes per run, the I/O overhead is negligible.

### Pitfall 8: Non-MP3 Audio Enclosures

**What goes wrong:** Some podcast feeds serve M4A (audio/mp4), OGG (audio/ogg), or other formats. The tool downloads them with a `.mp3` extension, and the MP3 player cannot play them.

**Why it happens:** The project targets MP3 files, but not all feeds serve MP3.

**How to avoid:** Check the enclosure `type` attribute. If it is `audio/mpeg` or the URL ends in `.mp3`, proceed. For other audio types, log a warning and skip: "Skipping: Episode Title (format: audio/mp4, MP3 only)". Do NOT save non-MP3 files with a `.mp3` extension.

**Recommendation for Phase 3:** Accept `audio/mpeg` enclosures. Skip others with a clear warning message. Count skipped-due-to-format episodes in the summary.

## Code Examples

### Complete Streaming Download Pattern

```typescript
// Source: Node.js Stream docs + Node.js Fetch API
import { createWriteStream } from 'node:fs';
import { rename, unlink, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname } from 'node:path';
import type { ReadableStream } from 'node:stream/web';

async function downloadFile(url: string, destPath: string): Promise<void> {
  const tmpPath = destPath + '.tmp';
  await mkdir(dirname(destPath), { recursive: true });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: AbortSignal.timeout(300_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Empty response body');
    }

    const nodeStream = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>
    );
    await pipeline(nodeStream, createWriteStream(tmpPath));
    await rename(tmpPath, destPath);
  } catch (error) {
    try { await unlink(tmpPath); } catch { /* no-op */ }
    throw error;
  }
}
```

### feedsmith Episode Extraction

```typescript
// Source: feedsmith docs (feedsmith.dev), jsDocs.io/package/feedsmith
import { parseFeed } from 'feedsmith';

const content = await (await fetch(url)).text();
const { feed } = parseFeed(content);

// Access RSS feed structure (feedsmith preserves format-specific shape)
const rssFeed = feed as {
  title?: string;
  items?: Array<{
    title?: string;
    guid?: { value?: string; isPermaLink?: boolean };
    pubDate?: string;
    enclosures?: Array<{
      url?: string;
      type?: string;
      length?: number;
    }>;
    itunes?: {
      duration?: string;
      title?: string;
    };
  }>;
};

// Extract episodes
for (const item of rssFeed.items ?? []) {
  const audio = item.enclosures?.find(e => e.type?.startsWith('audio/'));
  if (!audio?.url) continue;

  const guid = item.guid?.value ?? audio.url;
  const title = item.title ?? item.itunes?.title ?? 'Untitled';
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : null;
}
```

### Console Output Pattern (Matching User Decisions)

```typescript
// Source: picocolors API + user decisions from CONTEXT.md
import pc from 'picocolors';

// Feed header
console.log(`\n${pc.bold(pc.cyan('The Daily'))}`);

// Downloading episode
console.log(`  Downloading: ${pc.white('Episode Title')}...`);
console.log(`  ${pc.green('Downloaded')}: Episode Title`);

// Skipped (already downloaded)
console.log(`  ${pc.dim('Skipping: Episode Title (already downloaded)')}`);

// Failed
console.log(`  ${pc.red('Failed')}: Episode Title (HTTP 503)`);

// No new episodes
console.log(`  ${pc.dim('No new episodes')}`);

// End-of-run summary
console.log(`\n${pc.bold('Summary')}`);
console.log(`  Downloaded: ${pc.green('3')}`);
console.log(`  Skipped:    ${pc.dim('7')}`);
console.log(`  Failed:     ${pc.red('1')}`);
console.log(`\n${pc.red('Failed episodes:')}`);
console.log(`  - The Daily: Episode Title`);
```

### Retry-Once Pattern for Failed Downloads

```typescript
async function downloadWithRetry(
  audioUrl: string,
  destPath: string,
): Promise<DownloadResult> {
  const first = await downloadEpisode(audioUrl, destPath);
  if (first.success) return first;

  // Retry once
  const second = await downloadEpisode(audioUrl, destPath);
  return second;
}
```

### pubDate to Date Prefix

```typescript
// RSS pubDate format: "Sun, 27 Mar 2011 20:17:21 +0100" (RFC 822)
// JavaScript Date constructor parses this natively
function formatDatePrefix(publishedAt: string | null): string {
  if (!publishedAt) return 'unknown-date';
  const date = new Date(publishedAt);
  if (isNaN(date.getTime())) return 'unknown-date';
  return date.toISOString().slice(0, 10); // "2011-03-27"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` + `.body.pipe()` | Native `fetch` + `Readable.fromWeb()` + `pipeline()` | Node.js 22 LTS (stable) | No external HTTP dependency. `pipeline()` handles all error cleanup automatically. |
| `response.arrayBuffer()` + `writeFileSync()` | Streaming via `pipeline()` + `createWriteStream()` | Always preferred for large files | Memory usage stays constant (~64KB buffer) regardless of file size. Critical for 50-200MB podcast episodes. |
| `AbortController` + `setTimeout` | `AbortSignal.timeout(ms)` | Node.js 18+ | One-line timeout instead of manual controller lifecycle management. |
| Bare GUID arrays in history | Status-tagged entries `{ guid, status }` | This phase | Enables "failed" tracking and automatic retry without a separate store. |

## Data Flow: Complete Download Pipeline

```
podcast-dl download
    |
    v
[Read feeds.json] --> Feed[] sorted alphabetically by name
    |
    v
FOR EACH feed:
    |
    v
[Fetch RSS XML] --> response.text()
    |  (30s timeout, User-Agent header)
    |  On error: log, skip feed, continue
    v
[Parse with feedsmith] --> parsed feed with items
    |
    v
[Extract Episode[]] --> guid, title, audioUrl, mimeType, publishedAt
    |  Skip items without audio enclosures
    |  Fall back to enclosure URL if guid missing
    v
[Filter episodes]
    |  Remove GUIDs with status "downloaded" in history
    |  Keep GUIDs with status "failed" (for retry)
    |  Sort by pubDate descending
    |  Take first 5
    |  Reverse for oldest-first download order
    v
Episode[] (0-5 episodes to download)
    |
    v
FOR EACH episode (sequential):
    |
    v
[Build filename] --> YYYY-MM-DD_Sanitized-Title.mp3
    |
    v
[Download to .tmp] --> fetch + Readable.fromWeb + pipeline + createWriteStream
    |  (5min timeout)
    |  On error: retry once
    v
[Rename .tmp -> .mp3] --> atomic rename
    |  On success: historyStore.markDownloaded(feedUrl, guid)
    |  On failure (after retry): historyStore.markFailed(feedUrl, guid)
    v
[Console output] --> per-episode status line
    |
    v
[End-of-run summary] --> totals + failed episode list
    |
    v
[Exit code] --> 0 if all succeeded, 1 if any failed
```

## History Store Migration Strategy

The current `DownloadHistory` type is `Record<string, string[]>` (bare GUID strings). Phase 3 needs `Record<string, HistoryEntry[]>` where `HistoryEntry = { guid: string; status: "downloaded" | "failed" }`.

**Migration approach (handle both formats):**

```typescript
function readAll(): DownloadHistory {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    // Migrate old format: string[] -> HistoryEntry[]
    const migrated: DownloadHistory = {};
    for (const [feedUrl, entries] of Object.entries(data)) {
      if (Array.isArray(entries)) {
        if (entries.length === 0) {
          migrated[feedUrl] = [];
        } else if (typeof entries[0] === 'string') {
          // Old format: bare GUID strings -> assume downloaded
          migrated[feedUrl] = (entries as string[]).map((guid) => ({
            guid,
            status: 'downloaded' as const,
          }));
        } else {
          // New format: already HistoryEntry[]
          migrated[feedUrl] = entries as HistoryEntry[];
        }
      }
    }
    return migrated;
  } catch {
    return {};
  }
}
```

This transparent migration means existing `history.json` files from Phase 1-2 testing work without any manual intervention.

## Downloads Directory

Per prior decision (01-01), paths use `process.cwd()` for project-relative directories. The downloads directory follows the same pattern:

```typescript
// Addition to src/state/paths.ts
export function getDownloadsDir(): string {
  return join(process.cwd(), 'downloads');
}
```

This keeps downloads alongside `data/feeds.json` and `data/history.json` in the project directory.

## Open Questions

1. **Should non-MP3 audio formats be counted in the "5 most recent" limit?**
   - What we know: User wants MP3 only. Feeds may have non-MP3 episodes mixed in.
   - What's unclear: If a feed has 10 episodes (5 M4A, 5 MP3), should we count the M4A ones against the limit or ignore them?
   - Recommendation: Filter for MP3-compatible enclosures (`audio/mpeg`) before applying the 5-episode limit. Non-MP3 episodes are invisible to the selection logic. This gives the user 5 actual downloadable episodes rather than a mix of downloads and skips.

2. **What if two episodes produce the same filename after date + title sanitization?**
   - What we know: Unlikely but possible if two episodes share the same pubDate and similar titles.
   - What's unclear: How to handle the collision.
   - Recommendation: For v1, let the second file overwrite the first. Both episodes will be marked as downloaded in history so they will not be re-downloaded. This edge case is extremely rare with date-prefixed names and not worth adding collision resolution complexity in v1.

3. **Should the download timeout be based on Content-Length or a fixed value?**
   - What we know: Audio files range from 10MB to 200MB. A fixed 5-minute timeout may be too short for very large files on slow connections.
   - What's unclear: The user's typical connection speed and episode sizes.
   - Recommendation: Use 5 minutes (300,000ms) as the fixed timeout for v1. This is generous for most episodes (50MB at 1Mbps takes ~7 minutes, so even this is tight). If it becomes an issue, make it configurable later.

## Sources

### Primary (HIGH confidence)
- [Node.js v22 Stream documentation](https://nodejs.org/api/stream.html) -- `Readable.fromWeb()`, `pipeline()` from `stream/promises`
- [Node.js v22 File System documentation](https://nodejs.org/api/fs.html) -- `createWriteStream`, `rename`, `unlink`, `mkdir`
- [feedsmith official docs - Parsing](https://feedsmith.dev/parsing/) -- `parseFeed()`, format detection, item access patterns
- [feedsmith official docs - Quick Start](https://feedsmith.dev/quick-start) -- Import patterns, basic usage
- [feedsmith reference - RSS types](https://feedsmith.dev/reference/feeds/rss) -- Rss.Feed, Rss.Item, Rss.Enclosure, Rss.Guid type definitions with all fields
- [jsDocs.io feedsmith types](https://www.jsdocs.io/package/feedsmith) -- Complete Rss.Item type with guid, pubDate, enclosures, itunes namespace
- [feedsmith GitHub](https://github.com/macieklamberski/feedsmith) -- v2.9.0, TypeScript, 28+ namespace support

### Secondary (MEDIUM confidence)
- [Node.js Fetch API - Saving a WebStream to a File](https://kyleunboxed.com/nodejs-fetch-api-saving-a-webstream-to-a-file/) -- `Readable.fromWeb()` + `pipeline()` pattern for file downloads
- [DefinitelyTyped #65542](https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/65542) -- ReadableStream type incompatibility requiring type assertion
- [nodejs/node#53119](https://github.com/nodejs/node/issues/53119) -- Incompatible ReadableStream TypeScript types, confirmed workaround: `as ReadableStream<Uint8Array>` from `node:stream/web`
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification) -- `<pubDate>` RFC 822 format, `<guid>` element, `<enclosure>` attributes

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all native Node.js APIs, verified via official documentation. No new dependencies.
- Architecture: HIGH -- linear pipeline pattern is universal in podcast downloaders. Streaming download pattern well-documented in Node.js docs.
- Pitfalls: HIGH -- TypeScript ReadableStream type issue verified via Node.js GitHub issues. Redirect handling, timeout, and temp file patterns verified via official docs.
- Episode extraction: HIGH -- feedsmith type definitions verified via jsDocs.io and official reference docs.
- History migration: MEDIUM -- migration pattern is straightforward but not tested against real data yet.

**Research date:** 2026-02-17
**Valid until:** 2026-05-17 (stable APIs, Node.js LTS, no fast-moving dependencies)
