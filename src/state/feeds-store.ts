import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import type { Feed } from '../types.js';

/**
 * Create a feeds store for managing podcast feed subscriptions.
 * Data is persisted to a JSON file using atomic writes for crash safety.
 * Corrupt or missing files are handled gracefully (return empty array).
 */
export function createFeedsStore(filePath: string) {
  function readAll(): Feed[] {
    if (!existsSync(filePath)) {
      return [];
    }
    try {
      const raw = readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as Feed[];
    } catch {
      // Corrupt JSON or read error -- return empty (Pitfall 3 recovery)
      return [];
    }
  }

  function writeAll(feeds: Feed[]): void {
    atomicWriteSync(filePath, JSON.stringify(feeds, null, 2));
  }

  return {
    /** Return all subscribed feeds */
    getAll(): Feed[] {
      return readAll();
    },

    /** Add a new feed subscription */
    add(feed: Feed): void {
      const feeds = readAll();
      feeds.push(feed);
      writeAll(feeds);
    },

    /** Remove a feed by URL. Returns true if a feed was removed. */
    remove(url: string): boolean {
      const feeds = readAll();
      const filtered = feeds.filter((f) => f.url !== url);
      if (filtered.length === feeds.length) {
        return false;
      }
      writeAll(filtered);
      return true;
    },

    /** Check whether a feed with the given URL exists */
    has(url: string): boolean {
      return readAll().some((f) => f.url === url);
    },
  };
}
