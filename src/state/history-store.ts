import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import type { HistoryEntry, DownloadHistory } from '../types.js';

/**
 * Create a history store for tracking downloaded and failed episode GUIDs.
 * Data is persisted to a JSON file using atomic writes for crash safety.
 * Corrupt or missing files are handled gracefully (return empty object).
 *
 * Supports transparent migration from old format (bare string arrays)
 * to new format (HistoryEntry[] with status field).
 *
 * IMPORTANT: This store NEVER checks the filesystem for MP3 files.
 * It only reads/writes its own JSON data file.
 */
export function createHistoryStore(filePath: string) {
  function readAll(): DownloadHistory {
    if (!existsSync(filePath)) {
      return {};
    }
    try {
      const raw = readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;

      // Migrate: detect old format (bare string arrays) vs new format (HistoryEntry[])
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
      // Corrupt JSON or read error -- return empty (Pitfall 3 recovery)
      return {};
    }
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
