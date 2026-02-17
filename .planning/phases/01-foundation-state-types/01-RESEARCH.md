# Phase 1: Foundation -- State & Types - Research

**Researched:** 2026-02-17
**Domain:** Persistent JSON state stores, atomic file writes, filename sanitization, TypeScript type definitions
**Confidence:** HIGH

## Summary

Phase 1 builds the foundational layer that every subsequent phase depends on: TypeScript type definitions for feeds and episodes, two JSON-based state stores (feeds store and history store) with atomic write protection, and a filename sanitization utility targeting FAT32 compatibility. This is entirely a data-layer and utility phase with no CLI, no network, no RSS parsing.

The technical domain is straightforward: read/write JSON files with crash-safe atomic writes (write to temp file, flush, rename), and sanitize arbitrary strings into filesystem-safe filenames. Node.js 22+ provides all the primitives needed natively (`fs.writeFileSync` with `flush: true`, `fs.renameSync`, `fs.mkdirSync` with `recursive: true`). The only external dependency needed is `filenamify` (v7.0.1) for filename sanitization, which handles the full matrix of reserved characters, control characters, and Unicode edge cases that would be error-prone to hand-roll.

**Primary recommendation:** Hand-roll atomic JSON writes using native `node:fs` (writeFileSync with flush + renameSync). Use `filenamify` for filename sanitization. Do NOT add `write-file-atomic` as a dependency -- the hand-rolled pattern is 8 lines of code and avoids adding a dependency with its own transitive dependencies for a trivially simple operation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STATE-01 | Tool tracks downloaded episodes by GUID to avoid re-downloading | History store design: JSON file mapping feed URLs to arrays of downloaded GUIDs. Store provides `isDownloaded(feedUrl, guid)` and `markDownloaded(feedUrl, guid)` operations. GUID is the stable identifier across URL changes. |
| STATE-02 | Deleting an MP3 file does not cause re-download (history is independent of filesystem) | History store is a standalone JSON file (`history.json`) that never checks filesystem for MP3 existence. Once a GUID is recorded, it stays recorded regardless of what happens to the actual file. |
| STATE-03 | State files use atomic writes to prevent corruption | Atomic write pattern: `writeFileSync` to temp file with `flush: true`, then `renameSync` to final path. If crash occurs during write, temp file is left (harmless), original file is untouched. |
| CLI-02 | Filenames are sanitized for filesystem safety (FAT32 compatible) | `filenamify` v7.0.1 handles all FAT32-illegal characters (`< > : " / \ | ? *`), control characters, and Unicode normalization. Configure with `maxLength: 200` and `replacement: '-'` for readable, safe filenames. |
</phase_requirements>

## Standard Stack

### Core (Phase 1 only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `node:fs` | Built-in (22+) | File read/write/rename | Native, zero dependencies. `writeFileSync` with `flush: true` option (added Node 21.0.0) ensures data reaches disk before rename. |
| Node.js `node:path` | Built-in | Path manipulation | `path.join`, `path.dirname` for cross-platform path construction. |
| filenamify | 7.0.1 | Filename sanitization | Handles the full matrix of illegal characters across FAT32/NTFS/APFS. Grapheme-aware truncation (won't split Unicode). ESM-only. Zero dependencies. |
| TypeScript | 5.9.x | Type definitions | Shared interfaces (`Feed`, `HistoryRecord`, etc.) catch data-shape bugs at compile time. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled atomic write | `write-file-atomic` v7.0.0 | Library adds 2 transitive deps. For writing 2 small JSON files, `writeFileSync` + `renameSync` is 8 lines of code. Library adds chown support and murmurhash temp naming we don't need. Hand-roll is correct here. |
| `filenamify` | Hand-rolled regex | Deceptively complex. Must handle: `< > : " / \ | ? *`, control chars, Unicode bidirectional marks, trailing dots/spaces (Windows), grapheme-aware truncation, reserved names (CON, PRN, NUL). `filenamify` handles all of these. Hand-rolling guarantees you miss edge cases. |
| JSON files | `conf` v15.1.0 | XDG-compliant paths, JSON schema validation, 8 transitive deps. Overkill for a personal tool storing 2 files. |
| JSON files | `lowdb` | Abstraction layer over JSON read/write. Adds complexity for zero benefit at this scale. |

**Installation (Phase 1 only):**
```bash
npm install filenamify
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)

```
src/
├── types.ts              # Shared TypeScript interfaces (Feed, Episode, HistoryEntry)
├── state/
│   ├── feeds-store.ts    # CRUD operations on feeds.json
│   ├── history-store.ts  # CRUD operations on history.json
│   └── atomic-write.ts   # Shared atomic write helper
└── utils/
    └── sanitize.ts       # Filename sanitization using filenamify
```

### Pattern 1: Atomic JSON File Write

**What:** Write data to a temporary file with `flush: true`, then rename to the target path. This ensures the target file is either the old version or the new version, never a partial write.

**When to use:** Every write to `feeds.json` or `history.json`.

**Why `flush: true` matters:** `writeFileSync` does NOT guarantee data reaches the disk -- it may sit in OS kernel buffers. If the machine loses power between write and rename, the temp file could be empty. The `flush` option (Node 21+, stable in Node 22 LTS) calls `fsync()` internally, ensuring data is on disk before the function returns. Only then is `renameSync` safe.

**Example:**
```typescript
// src/state/atomic-write.ts
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function atomicWriteSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data, { encoding: 'utf-8', flush: true });
  renameSync(tmpPath, filePath);
}
```

**Why this works:**
- `writeFileSync` with `flush: true` ensures bytes reach disk
- `renameSync` is atomic on POSIX (macOS, Linux) -- it either completes or doesn't
- If crash occurs during `writeFileSync`, the `.tmp` file is left but the original file is untouched
- If crash occurs between `writeFileSync` and `renameSync` (extremely unlikely), the `.tmp` file contains the complete data and the original is untouched
- On next read, the original file is read normally (the `.tmp` is orphaned and harmless)

### Pattern 2: JSON Store with Read-Modify-Write

**What:** Each store reads the entire JSON file into memory, modifies the in-memory data structure, then writes the entire file back atomically. No partial updates, no append-only log.

**When to use:** All state mutations (add feed, remove feed, mark episode downloaded).

**Example:**
```typescript
// src/state/feeds-store.ts
import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import type { Feed } from '../types.js';

const FEEDS_PATH = ''; // Configured at runtime

export function createFeedsStore(filePath: string) {
  function readAll(): Feed[] {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Feed[];
  }

  function writeAll(feeds: Feed[]): void {
    atomicWriteSync(filePath, JSON.stringify(feeds, null, 2));
  }

  return {
    getAll: readAll,
    add(feed: Feed): void {
      const feeds = readAll();
      feeds.push(feed);
      writeAll(feeds);
    },
    remove(url: string): boolean {
      const feeds = readAll();
      const filtered = feeds.filter(f => f.url !== url);
      if (filtered.length === feeds.length) return false;
      writeAll(filtered);
      return true;
    },
    has(url: string): boolean {
      return readAll().some(f => f.url === url);
    },
  };
}
```

### Pattern 3: History Store with Set-Like Access

**What:** History is keyed by feed URL, with each key mapping to an array of downloaded episode GUIDs. The primary operation is "has this GUID been downloaded?" which is a Set membership check.

**When to use:** Before every download to check if episode is already downloaded, and after every successful download to record the GUID.

**Example:**
```typescript
// src/state/history-store.ts
import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteSync } from './atomic-write.js';
import type { DownloadHistory } from '../types.js';

export function createHistoryStore(filePath: string) {
  function readAll(): DownloadHistory {
    if (!existsSync(filePath)) return {};
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as DownloadHistory;
  }

  function writeAll(history: DownloadHistory): void {
    atomicWriteSync(filePath, JSON.stringify(history, null, 2));
  }

  return {
    isDownloaded(feedUrl: string, guid: string): boolean {
      const history = readAll();
      return history[feedUrl]?.includes(guid) ?? false;
    },
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
    getDownloadedGuids(feedUrl: string): string[] {
      const history = readAll();
      return history[feedUrl] ?? [];
    },
  };
}
```

### Pattern 4: Factory Function Over Class

**What:** Use factory functions that return plain objects with closures over state, rather than ES6 classes. Each store is created by calling `createFeedsStore(path)` or `createHistoryStore(path)`.

**When to use:** For small modules with few methods and no inheritance needs.

**Why:** Factory functions are simpler to test (pass different file paths), avoid `this` binding issues, and produce plain objects that TypeScript infers well. Classes add boilerplate (`constructor`, `this.` prefix) for no benefit at this scale.

### Anti-Patterns to Avoid

- **Checking file existence before every read with a race condition:** Use try/catch around `readFileSync` + `JSON.parse` rather than `existsSync` followed by `readFileSync` (file could be deleted between the two calls). However, for this personal tool where only one process ever accesses the files, `existsSync` is fine and more readable.

- **Storing full episode metadata in history:** History only needs GUIDs. Storing titles, dates, URLs bloats the file and creates stale data. Episode metadata is re-fetchable from the RSS feed.

- **Using `JSON.parse(readFileSync(...))` without error handling:** A corrupt or empty file will crash `JSON.parse`. Wrap in try/catch and return empty default on parse failure.

- **Writing state after batch completion instead of after each download:** If the process crashes mid-batch, all completed downloads in that batch are lost from history and will be re-downloaded. Write history after EACH successful download.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filename sanitization | Regex to strip `/:*?"<>\|` | `filenamify` v7.0.1 | Must also handle: control chars, Unicode bidirectional marks, trailing dots/spaces (Windows), reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), grapheme-aware truncation. The full matrix is ~30 edge cases. filenamify covers them all. |
| JSON schema validation | Custom type guards for every field | Simple type assertion + defensive coding | At this scale (2 files, known format), full schema validation is overkill. Use TypeScript types for compile-time safety and basic runtime checks (is it an array? does it have expected keys?). |

**Key insight:** Filename sanitization is the only "deceptively complex" problem in Phase 1. The atomic write pattern is simple enough to hand-roll (8 lines). Everything else is standard JSON file I/O.

## Common Pitfalls

### Pitfall 1: writeFileSync Does Not Flush to Disk

**What goes wrong:** You call `writeFileSync(tmpPath, data)` then `renameSync(tmpPath, finalPath)`. The data is in OS kernel buffers but not on disk. Power loss at this moment means `tmpPath` exists but is empty or partial. On next boot, `finalPath` was successfully renamed from a corrupt temp file.

**Why it happens:** `writeFileSync` writes to the kernel's page cache, not directly to disk. The OS flushes asynchronously.

**How to avoid:** Use `writeFileSync(tmpPath, data, { flush: true })`. The `flush` option was added in Node.js 21.0.0 and is stable in Node 22 LTS. It calls `fsync()` internally before closing the file descriptor.

**Warning signs:** State files are 0 bytes or contain partial JSON after a crash. Extremely rare in practice for a personal CLI tool, but the fix is trivial so always use `flush: true`.

### Pitfall 2: renameSync Across Filesystems Fails

**What goes wrong:** `renameSync` throws `EXDEV` (cross-device link) if the temp file and target file are on different filesystems/mount points.

**Why it happens:** POSIX `rename(2)` only works within the same filesystem. If someone puts the state directory on a different mount, the temp file in the same directory won't have this problem, but if the temp file is in `/tmp` and the target is in `~/.rss-dl/`, it fails.

**How to avoid:** Always create the temp file in the same directory as the target file (e.g., `filePath + '.tmp'`). Never use `/tmp` or `os.tmpdir()` for the temp file.

**Warning signs:** `EXDEV: cross-device link not permitted` error.

### Pitfall 3: JSON.parse Crashes on Empty or Corrupt Files

**What goes wrong:** The state file is empty (0 bytes) or contains malformed JSON. `JSON.parse('')` throws `SyntaxError: Unexpected end of JSON input`. The tool crashes on startup.

**Why it happens:** A previous crash left a partial write, the user accidentally edited the file, or the file was created but never written to.

**How to avoid:** Wrap `JSON.parse` in try/catch. On failure, return the empty default (empty array for feeds, empty object for history) and log a warning. Optionally back up the corrupt file before overwriting.

```typescript
function safeReadJson<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    // Corrupt file -- return default, next write will fix it
    return defaultValue;
  }
}
```

**Warning signs:** `SyntaxError` from `JSON.parse` in store initialization.

### Pitfall 4: Filename Sanitization Not Applied to Podcast Name (Folder Name)

**What goes wrong:** The podcast name is used as a folder name (`downloads/<PodcastName>/`) but contains characters illegal on FAT32. The folder creation fails, or the folder is created on macOS but can't be read on the MP3 player's FAT32 filesystem.

**Why it happens:** Developers sanitize the episode filename but forget to also sanitize the podcast (folder) name.

**How to avoid:** Apply `filenamify` to both the podcast name (folder) AND the episode title (filename). The same character restrictions apply to directory names on FAT32.

### Pitfall 5: filenamify Default maxLength is 100, Not 255

**What goes wrong:** Long episode titles are truncated to 100 characters by default. Combined with a date prefix (`2026-02-17_`) that's 11 characters, the actual title gets only 89 characters before the `.mp3` extension.

**Why it happens:** `filenamify` defaults to `maxLength: 100` for "usability" even though FAT32 supports 255 characters.

**How to avoid:** Set `maxLength: 200` explicitly. This gives plenty of room while staying well under FAT32's 255-character limit. The extension (`.mp3`, 4 chars) is preserved separately by filenamify and does not count against maxLength.

## Code Examples

### Type Definitions

```typescript
// src/types.ts

/** A podcast feed subscription */
export interface Feed {
  /** RSS feed URL */
  url: string;
  /** Human-readable podcast name (from RSS <title> or user-provided) */
  name: string;
  /** ISO 8601 timestamp when feed was added */
  addedAt: string;
}

/** Download history: maps feed URL to array of downloaded episode GUIDs */
export type DownloadHistory = Record<string, string[]>;

/** A parsed podcast episode (used in later phases, defined here for type stability) */
export interface Episode {
  /** Episode GUID from RSS <guid> element */
  guid: string;
  /** Episode title from RSS <title> element */
  title: string;
  /** Audio file URL from RSS <enclosure url="..."> */
  audioUrl: string;
  /** MIME type from RSS <enclosure type="..."> */
  mimeType: string;
  /** Publication date as ISO 8601 string, parsed from RSS <pubDate> */
  publishedAt: string | null;
}
```

### Filename Sanitization Utility

```typescript
// src/utils/sanitize.ts
import filenamify from 'filenamify';

const MAX_FILENAME_LENGTH = 200;
const REPLACEMENT_CHAR = '-';

/**
 * Sanitize a string for use as a filename on FAT32 filesystems.
 * Removes illegal characters, truncates to safe length, handles Unicode.
 */
export function sanitizeFilename(name: string): string {
  return filenamify(name, {
    maxLength: MAX_FILENAME_LENGTH,
    replacement: REPLACEMENT_CHAR,
  });
}

/**
 * Sanitize a string for use as a directory name.
 * Same rules as filename -- FAT32 restrictions apply to directories too.
 */
export function sanitizeDirName(name: string): string {
  const sanitized = filenamify(name, {
    maxLength: MAX_FILENAME_LENGTH,
    replacement: REPLACEMENT_CHAR,
  });
  // Trim leading/trailing whitespace and dashes that may result from sanitization
  return sanitized.replace(/^[-\s]+|[-\s]+$/g, '').trim() || 'unknown-podcast';
}
```

### Atomic Write Helper

```typescript
// src/state/atomic-write.ts
import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Write data to a file atomically.
 * Uses temp-file-then-rename pattern to prevent corruption on crash.
 *
 * Guarantees:
 * - Target file is always either old content or new content, never partial
 * - Data is flushed to disk before rename (flush: true calls fsync)
 * - Parent directories are created if they don't exist
 */
export function atomicWriteSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data, { encoding: 'utf-8', flush: true });
  renameSync(tmpPath, filePath);
}
```

### Store Data Directory Resolution

```typescript
// src/state/paths.ts
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the data directory for state files.
 * Uses ~/.podcast-dl/ as the default location.
 */
export function getDataDir(): string {
  return join(homedir(), '.podcast-dl');
}

/** Path to the feeds.json state file */
export function getFeedsPath(): string {
  return join(getDataDir(), 'feeds.json');
}

/** Path to the history.json state file */
export function getHistoryPath(): string {
  return join(getDataDir(), 'history.json');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `writeFileSync` without flush | `writeFileSync` with `{ flush: true }` | Node.js 21.0.0 (Oct 2023), stable in Node 22 LTS | Ensures data reaches disk before function returns. Eliminates the window where a crash could leave a flushed-but-not-synced file. No need for manual `fs.openSync` + `fs.fsyncSync` + `fs.closeSync` dance. |
| `mkdirp` package for recursive dir creation | `mkdirSync(path, { recursive: true })` | Node.js 10.12.0 (2018) | No need for the `mkdirp` npm package. Native and zero-dependency. |
| `fs.existsSync` deprecated warnings | `fs.existsSync` un-deprecated | Node.js 12+ | Was deprecated, then un-deprecated. Safe to use for simple existence checks in synchronous code paths. |

**Deprecated/outdated:**
- `mkdirp` npm package: Use native `mkdirSync({ recursive: true })` instead.
- `write-file-atomic` for simple use cases: The `flush: true` option on `writeFileSync` (Node 21+) provides the missing piece that previously required this library. For complex scenarios (chown, mode preservation), the library is still useful.

## Data Store Design Decisions

### feeds.json Shape

```json
[
  {
    "url": "https://example.com/feed.xml",
    "name": "My Podcast",
    "addedAt": "2026-02-17T10:30:00.000Z"
  }
]
```

**Why an array:** Feeds are a small, ordered list. Array is natural for iteration, easy to filter, and directly maps to the `Feed[]` type. No need for a map/object keyed by URL -- with 1-5 feeds, linear search is instant.

### history.json Shape

```json
{
  "https://example.com/feed.xml": [
    "episode-guid-1",
    "episode-guid-2",
    "episode-guid-3"
  ]
}
```

**Why keyed by feed URL:** Groups history per feed for easy inspection and potential future "purge history for removed feed" functionality. Feed URL is the stable key that ties together feeds.json entries and history.json entries.

**Why array of strings (not objects):** History only needs to answer "was this GUID downloaded?" -- a simple `includes()` check. Storing timestamps or metadata per download adds complexity for zero user value. If needed later, can migrate the shape without affecting the API.

### Data Directory: `~/.podcast-dl/`

- Standard Unix convention for CLI tool state
- Hidden directory keeps it out of the user's way
- Separate from the downloads directory (which the user actively manages)
- Not XDG-compliant (would be `~/.local/share/podcast-dl/`) but simpler for a personal tool

## Testing Strategy Notes

Testing patterns for the planner to create verification steps:

1. **Atomic write verification:** Write a file, verify content, simulate crash by checking temp file behavior. Test that writing to a nonexistent parent directory creates it.

2. **Feeds store round-trip:** Add feeds, read back, verify order and content. Remove feed by URL, verify it's gone and others remain. Test with empty initial state (no file exists).

3. **History store round-trip:** Mark GUIDs as downloaded, verify `isDownloaded` returns true. Verify GUIDs from different feeds don't interfere. Test with empty initial state.

4. **Filename sanitization:** Test with strings containing: colons (`:`), slashes (`/`), quotes (`"`), angle brackets (`<>`), pipes (`|`), question marks (`?`), asterisks (`*`), control characters, emoji, very long strings (300+ chars), empty strings, strings that are entirely illegal characters.

5. **Corrupt state recovery:** Write invalid JSON to feeds.json, verify store returns empty array (not crash). Write empty file, verify same behavior.

## Open Questions

1. **Data directory location: `~/.podcast-dl/` vs configurable?**
   - What we know: The project research consistently uses `~/.rssdownload/` or `~/.rss-dl/`. No prior decision exists.
   - What's unclear: Whether the tool name is `podcast-dl`, `rss-dl`, or something else. This affects the directory name.
   - Recommendation: Use a constant that's easy to change later. The exact name doesn't matter for Phase 1 as long as it's consistent. Default to `~/.podcast-dl/`.

2. **Should stores use sync or async fs operations?**
   - What we know: The tool is a simple CLI that runs, does work, and exits. There's no event loop to block.
   - What's unclear: Whether async would be "better practice" even if not needed.
   - Recommendation: Use sync operations (`readFileSync`, `writeFileSync`). Simpler code, no async infection through the codebase, perfectly appropriate for a CLI tool that processes sequentially. The files are tiny (< 10KB). Async adds complexity for zero benefit.

## Sources

### Primary (HIGH confidence)
- [Node.js v22 LTS `fs` documentation](https://nodejs.org/api/fs.html) -- `writeFileSync` flush option, `renameSync` atomicity, `mkdirSync` recursive option
- [Node.js v21.0.0 release notes](https://nodejs.org/en/blog/release/v21.0.0) -- `flush` option added to `writeFile` family (PR #50009)
- [filenamify GitHub](https://github.com/sindresorhus/filenamify) -- API, options, reserved character handling, grapheme-aware truncation, v7.0.1
- [filenamify npm](https://www.npmjs.com/package/filenamify) -- Version 7.0.1, ESM-only, zero dependencies

### Secondary (MEDIUM confidence)
- [write-file-atomic GitHub](https://github.com/npm/write-file-atomic) -- v7.0.0, atomic write implementation reference, fsync behavior
- [write-file-atomic issue #16](https://github.com/npm/write-file-atomic/issues/16) -- Discussion of writeFileSync not flushing to disk, motivating the fsync requirement
- [Microsoft: Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) -- FAT32/NTFS reserved characters and names
- [FAT32 filename reference](https://averstak.tripod.com/fatdox/names.htm) -- FAT32 long filename support (255 chars), illegal characters
- [Node.js issue #49886](https://github.com/nodejs/node/issues/49886) -- Feature request and discussion for fsync option in writeFile

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- native Node.js APIs, filenamify well-established (100M+ downloads)
- Architecture: HIGH -- read-modify-write JSON is the simplest possible pattern, well-understood
- Pitfalls: HIGH -- atomic write edge cases documented in Node.js core issues and write-file-atomic discussions
- Type definitions: HIGH -- straightforward interfaces derived from project requirements

**Research date:** 2026-02-17
**Valid until:** 2026-06-17 (stable domain, Node.js LTS, no fast-moving dependencies)
