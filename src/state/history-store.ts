import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import type { DownloadHistory } from '../types.js';

/**
 * Create a history store for tracking downloaded episode GUIDs.
 * Data is persisted to a JSON file using atomic writes for crash safety.
 * Corrupt or missing files are handled gracefully (return empty object).
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
      return JSON.parse(raw) as DownloadHistory;
    } catch {
      // Corrupt JSON or read error -- return empty (Pitfall 3 recovery)
      return {};
    }
  }

  function writeAll(history: DownloadHistory): void {
    atomicWriteSync(filePath, JSON.stringify(history, null, 2));
  }

  return {
    /** Check if a specific episode GUID has been downloaded for a feed */
    isDownloaded(feedUrl: string, guid: string): boolean {
      const history = readAll();
      return history[feedUrl]?.includes(guid) ?? false;
    },

    /** Mark an episode GUID as downloaded for a feed */
    markDownloaded(feedUrl: string, guid: string): void {
      const history = readAll();
      if (!history[feedUrl]) {
        history[feedUrl] = [];
      }
      if (!history[feedUrl].includes(guid)) {
        history[feedUrl].push(guid);
      }
      writeAll(history);
    },

    /** Get all downloaded GUIDs for a feed, or empty array if none */
    getDownloadedGuids(feedUrl: string): string[] {
      const history = readAll();
      return history[feedUrl] ?? [];
    },
  };
}
