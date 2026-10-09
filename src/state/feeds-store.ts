import { atomicWriteSync } from './atomic-write.js';
import { isRecord, readStateFile } from './state-file.js';
import type { Feed } from '../types.js';

function decodeFeeds(data: unknown): Feed[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const valid = data.every(
    (feed) => isRecord(feed) && typeof feed.url === 'string' && typeof feed.name === 'string',
  );
  return valid ? (data as Feed[]) : undefined;
}

/**
 * Create a feeds store for managing podcast feed subscriptions.
 * Data is persisted to a JSON file using atomic writes for crash safety.
 * A missing file is an empty list. A file that is there but unreadable makes
 * this throw, naming the file, so it is never overwritten.
 */
export function createFeedsStore(filePath: string) {
  function readAll(): Feed[] {
    return readStateFile(filePath, () => [], decodeFeeds, 'a list of feeds');
  }

  function writeAll(feeds: Feed[]): void {
    atomicWriteSync(filePath, JSON.stringify(feeds, null, 2));
  }

  readAll();

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
