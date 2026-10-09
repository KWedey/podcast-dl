import { atomicWriteSync } from './atomic-write.js';
import { isRecord, readStateFile } from './state-file.js';
import type { HistoryEntry, DownloadHistory } from '../types.js';

/**
 * Accepts the current format (HistoryEntry[] per feed) and migrates the old
 * one (bare GUID strings, which all meant "downloaded").
 */
function decodeHistory(data: unknown): DownloadHistory | undefined {
  if (!isRecord(data)) return undefined;
  const history: DownloadHistory = {};
  for (const [feedUrl, entries] of Object.entries(data)) {
    if (!Array.isArray(entries)) return undefined;
    const decoded: HistoryEntry[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        decoded.push({ guid: entry, status: 'downloaded' });
      } else if (
        isRecord(entry) &&
        typeof entry.guid === 'string' &&
        (entry.status === 'downloaded' || entry.status === 'failed')
      ) {
        decoded.push({ guid: entry.guid, status: entry.status });
      } else {
        return undefined;
      }
    }
    history[feedUrl] = decoded;
  }
  return history;
}

/**
 * Create a history store for tracking downloaded and failed episode GUIDs.
 * Data is persisted to a JSON file using atomic writes for crash safety.
 * A missing file is an empty history. A file that is there but unreadable
 * makes this throw, naming the file, so it is never overwritten.
 *
 * IMPORTANT: This store NEVER checks the filesystem for MP3 files.
 * It only reads/writes its own JSON data file.
 */
export function createHistoryStore(filePath: string) {
  function readAll(): DownloadHistory {
    return readStateFile(
      filePath,
      () => ({}),
      decodeHistory,
      'an object of feed URLs to episode lists',
    );
  }

  function writeAll(history: DownloadHistory): void {
    atomicWriteSync(filePath, JSON.stringify(history, null, 2));
  }

  /**
   * Upsert an entry for a feed: if the guid already exists, update its status;
   * otherwise push a new entry.
   */
  function upsertEntry(
    feedUrl: string,
    guid: string,
    status: HistoryEntry['status'],
  ): void {
    const history = readAll();
    if (!history[feedUrl]) {
      history[feedUrl] = [];
    }
    const existing = history[feedUrl].find((e) => e.guid === guid);
    if (existing) {
      existing.status = status;
    } else {
      history[feedUrl].push({ guid, status });
    }
    writeAll(history);
  }

  readAll();

  return {
    /** Check if a specific episode GUID has been downloaded for a feed */
    isDownloaded(feedUrl: string, guid: string): boolean {
      const history = readAll();
      return (
        history[feedUrl]?.some(
          (e) => e.guid === guid && e.status === 'downloaded',
        ) ?? false
      );
    },

    /** Mark an episode GUID as downloaded for a feed (upserts: clears failed state if present) */
    markDownloaded(feedUrl: string, guid: string): void {
      upsertEntry(feedUrl, guid, 'downloaded');
    },

    /** Get all downloaded GUIDs for a feed, or empty array if none */
    getDownloadedGuids(feedUrl: string): string[] {
      const history = readAll();
      return (
        history[feedUrl]
          ?.filter((e) => e.status === 'downloaded')
          .map((e) => e.guid) ?? []
      );
    },

    /** Check if a specific episode GUID has failed for a feed */
    isFailed(feedUrl: string, guid: string): boolean {
      const history = readAll();
      return (
        history[feedUrl]?.some(
          (e) => e.guid === guid && e.status === 'failed',
        ) ?? false
      );
    },

    /** Mark an episode GUID as failed for a feed (upserts: sets status to failed) */
    markFailed(feedUrl: string, guid: string): void {
      upsertEntry(feedUrl, guid, 'failed');
    },
  };
}
