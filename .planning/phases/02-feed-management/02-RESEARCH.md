# Phase 2: Feed Management - Research

**Researched:** 2026-02-17
**Domain:** CLI command routing (Commander.js), RSS feed validation (feedsmith), feed subscription management
**Confidence:** HIGH

## Summary

Phase 2 wires up the CLI entry point and implements three commands: `add`, `remove`, and `list`. The `add` command is the most complex -- it must fetch the URL, parse it with feedsmith to confirm it is a valid RSS feed, extract the podcast title, then persist the feed to the feeds store built in Phase 1. The `remove` and `list` commands are simple store operations with console output.

The technical domain is well-understood. Commander.js provides the CLI framework with subcommands and argument parsing. feedsmith's `parseFeed` function handles RSS validation by throwing an `Error` with the message "Unrecognized feed format" for non-RSS content -- this is the validation mechanism for FEED-03. Native `fetch` (Node.js 22+) retrieves the RSS XML from the URL. picocolors provides colored terminal output for success/error feedback.

The key architectural decision is where the "fetch + parse + validate" logic lives. It should be a standalone service function (`validateFeed`) in `src/services/feed-validator.ts` that the `add` command calls. This same parsing logic will be reused in Phase 3 for episode extraction, so separating it from the CLI command is critical. The `add` command becomes a thin orchestrator: validate URL format, call validateFeed, store result.

**Primary recommendation:** Use Commander.js with `parseAsync()` for async action handlers. Use feedsmith's `parseFeed()` wrapped in try/catch as the RSS validation gate. Extract podcast title from parsed feed for the `name` field in the feeds store. Keep command files thin -- delegate to services.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FEED-01 | User can add an RSS feed URL via CLI command | Commander.js `.command('add').argument('<url>')` with async action handler that fetches URL, parses with feedsmith, and persists to feeds store via `createFeedsStore`. |
| FEED-02 | User can remove a feed via CLI command | Commander.js `.command('remove').argument('<url-or-name>')` with action handler that calls `feedsStore.remove()`. Support matching by URL or by podcast name for usability. |
| FEED-03 | Feed URLs are validated (confirmed parseable as RSS) on add | feedsmith's `parseFeed(xmlContent)` throws `Error("Unrecognized feed format")` for non-RSS content. Wrap in try/catch: parse success = valid RSS, catch = invalid. Also validate URL format before fetching (must be http/https). |
</phase_requirements>

## Standard Stack

### Core (Phase 2 additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Commander | 14.0.3 | CLI subcommands (add, remove, list) | Standard CLI framework for Node.js. Dual ESM/CJS. Built-in TypeScript types. Handles argument parsing, help generation, version flag. 38M+ weekly downloads. |
| feedsmith | 2.9.0 | RSS feed parsing and validation | Purpose-built feed parser with 31 namespace support (iTunes, Podcast Index, Media RSS). TypeScript-native. Throws on invalid content (validation gate). Dual ESM/CJS. |
| picocolors | 1.1.1 | Colored terminal output | Success (green), error (red), info (yellow) messages. 3.5x faster than chalk, 14x smaller. Zero dependencies. |
| Native `fetch` | Built-in (Node 22+) | HTTP requests to fetch RSS XML | Stable global in Node 22+. Follows redirects by default. No need for axios/got/node-fetch. |

### From Phase 1 (consumed, not installed)

| Module | Provides | Used By |
|--------|----------|---------|
| `src/state/feeds-store.ts` | `createFeedsStore(filePath)` with `getAll()`, `add()`, `remove()`, `has()` | add, remove, list commands |
| `src/state/paths.ts` | `getFeedsPath()` returning `~/.podcast-dl/feeds.json` | CLI entry point to create store instance |
| `src/types.ts` | `Feed` interface with `url`, `name`, `addedAt` | Feed validation and store operations |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Commander 14 | yargs 18 | Yargs has richer validation middleware but steeper learning curve. Commander is simpler for 3-4 subcommands. No benefit from yargs complexity here. |
| `parseFeed()` for validation | `HEAD` request + Content-Type check | Content-Type alone is unreliable -- many servers return `text/xml` or `application/xml` for RSS, Atom, and non-feed XML. Parsing confirms it is actually a feed with items. |
| feedsmith `parseFeed` | feedsmith `parseRssFeed` | `parseFeed` auto-detects format (RSS, Atom, JSON Feed) which is more forgiving. `parseRssFeed` would reject Atom feeds that are valid podcast feeds. Use universal parser. |

**Installation (Phase 2):**
```bash
npm install commander feedsmith picocolors
```

**Dev dependencies (if not already installed):**
```bash
npm install -D tsx
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
src/
├── cli.ts                    # Entry point: Commander setup, subcommand registration
├── commands/
│   ├── add.ts                # 'add <url>' command handler
│   ├── remove.ts             # 'remove <url-or-name>' command handler
│   └── list.ts               # 'list' command handler
├── services/
│   └── feed-validator.ts     # Fetch URL + parse with feedsmith + return feed metadata
├── state/                    # (from Phase 1)
│   ├── feeds-store.ts
│   ├── history-store.ts
│   ├── atomic-write.ts
│   └── paths.ts
├── types.ts                  # (from Phase 1)
└── utils/
    └── sanitize.ts           # (from Phase 1)
```

### Pattern 1: Thin Command Handlers

**What:** Each command file exports a function that registers a command on a Commander program. The handler delegates to services and store operations -- it does not contain business logic itself.

**When to use:** Every CLI command.

**Why:** Keeps commands testable by mocking services. Prevents CLI framework coupling from leaking into business logic. Services can be reused by different commands (feed-validator is used by `add` now and by `download` in Phase 3).

**Example:**
```typescript
// src/commands/add.ts
import { Command } from 'commander';
import pc from 'picocolors';
import { validateFeed } from '../services/feed-validator.js';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';
import type { Feed } from '../types.js';

export function registerAddCommand(program: Command): void {
  program
    .command('add')
    .description('Subscribe to a podcast RSS feed')
    .argument('<url>', 'RSS feed URL')
    .action(async (url: string) => {
      // 1. Validate URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.error(pc.red('Error: URL must start with http:// or https://'));
        process.exit(1);
      }

      // 2. Check for duplicate
      const store = createFeedsStore(getFeedsPath());
      if (store.has(url)) {
        console.error(pc.yellow('Feed already subscribed: ' + url));
        process.exit(1);
      }

      // 3. Validate RSS feed
      const result = await validateFeed(url);

      // 4. Store feed
      const feed: Feed = {
        url,
        name: result.title,
        addedAt: new Date().toISOString(),
      };
      store.add(feed);
      console.log(pc.green(`Subscribed to "${feed.name}"`));
    });
}
```

### Pattern 2: Feed Validator Service

**What:** A service function that takes a URL, fetches the content, parses it with feedsmith, and returns structured metadata (title, item count). If the content is not a valid feed, it throws with a user-friendly error message.

**When to use:** The `add` command (Phase 2) and the `download` command (Phase 3, which will also need to parse feeds for episode data).

**Why:** Isolates network + parsing logic from CLI concerns. The validator handles: URL fetch errors, non-200 responses, non-feed content, and feed parsing. Each failure mode produces a clear error message.

**Example:**
```typescript
// src/services/feed-validator.ts
import { parseFeed } from 'feedsmith';

export interface FeedValidationResult {
  title: string;
  itemCount: number;
  format: string;
}

export async function validateFeed(url: string): Promise<FeedValidationResult> {
  // 1. Fetch the URL
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'podcast-dl/0.1.0' },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Request timed out fetching ${url}`);
    }
    throw new Error(`Failed to fetch ${url}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  // 2. Parse as feed
  const content = await response.text();
  let parsed;
  try {
    parsed = parseFeed(content);
  } catch {
    throw new Error('URL is not a valid RSS feed');
  }

  // 3. Extract metadata
  const feed = parsed.feed;
  const title = (feed as { title?: string }).title || 'Untitled Podcast';
  const items = (feed as { items?: unknown[] }).items || [];

  return {
    title,
    itemCount: items.length,
    format: parsed.format,
  };
}
```

### Pattern 3: CLI Entry Point with parseAsync

**What:** The main entry point creates a Commander program, registers all commands, and calls `parseAsync()` (not `parse()`) because action handlers are async.

**When to use:** Always -- the `add` command is async (it fetches a URL).

**Why:** `parse()` does not await async action handlers -- the program would exit before the fetch completes. `parseAsync()` returns a Promise that resolves when the action finishes.

**Critical:** Must use `parseAsync()`, not `parse()`. This is the most common Commander + async mistake.

**Example:**
```typescript
// src/cli.ts
import { Command } from 'commander';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerListCommand } from './commands/list.js';

const program = new Command();

program
  .name('podcast-dl')
  .description('Download podcast episodes from RSS feeds')
  .version('0.1.0');

registerAddCommand(program);
registerRemoveCommand(program);
registerListCommand(program);

program.parseAsync(process.argv);
```

### Pattern 4: Remove by URL or Name

**What:** The `remove` command accepts either a feed URL or a feed name, matching against both fields in the store.

**When to use:** Always -- users may not remember the exact URL but will remember the podcast name.

**Example:**
```typescript
// src/commands/remove.ts
import { Command } from 'commander';
import pc from 'picocolors';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove')
    .description('Unsubscribe from a podcast feed')
    .argument('<url-or-name>', 'Feed URL or podcast name')
    .action((identifier: string) => {
      const store = createFeedsStore(getFeedsPath());
      const feeds = store.getAll();

      // Try URL match first, then name match (case-insensitive)
      const match = feeds.find(
        (f) => f.url === identifier || f.name.toLowerCase() === identifier.toLowerCase()
      );

      if (!match) {
        console.error(pc.red(`No feed found matching "${identifier}"`));
        process.exit(1);
      }

      store.remove(match.url);
      console.log(pc.green(`Unsubscribed from "${match.name}"`));
    });
}
```

### Pattern 5: package.json bin Entry

**What:** Configure the CLI as an executable via `package.json` `bin` field, pointing to the compiled JS entry point with a shebang.

**When to use:** Always -- this is how `npx podcast-dl` and `npm link` work.

**Example (package.json addition):**
```json
{
  "bin": {
    "podcast-dl": "./dist/cli.js"
  }
}
```

The compiled `dist/cli.js` must have a shebang as its first line:
```typescript
// src/cli.ts -- first line:
#!/usr/bin/env node
```

TypeScript preserves shebangs during compilation when they appear at the top of the source file.

### Anti-Patterns to Avoid

- **Using `parse()` instead of `parseAsync()` with async handlers:** The program exits before the async action completes. The fetch never finishes. No error, no output -- just silent failure.

- **Putting fetch + parse logic directly in the command handler:** Makes the `add` command untestable without mocking `fetch`. The same logic is needed again in Phase 3 for downloading episodes. Extract to a service.

- **Validating only URL format, not feed content:** A URL can be valid HTTP but serve HTML, JSON, or an XML document that is not an RSS feed. FEED-03 requires confirming the URL is parseable as RSS. Must fetch + parse.

- **Creating a new feeds store instance inside each command separately:** The store factory needs a consistent file path. Import `getFeedsPath()` once and pass it to `createFeedsStore()`. Do not hardcode the path in each command file.

- **Swallowing errors from fetch/parse without user feedback:** Every failure (network error, timeout, non-200 status, invalid feed) must produce a clear console message explaining what went wrong.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS feed format detection | Content-Type header check or regex for `<rss` tag | feedsmith `parseFeed()` | Content-Type is unreliable. Regex misses Atom and JSON feeds. feedsmith auto-detects RSS, Atom, RDF, and JSON Feed formats, handles namespace variations, and tolerates malformed XML. |
| CLI argument parsing | Manual `process.argv` parsing | Commander.js | Commander handles: help generation, version flag, unknown command errors, required vs optional arguments, error formatting. Hand-rolling means reimplementing all of this. |
| Terminal colors | Raw ANSI escape codes | picocolors | Escape codes are unreadable, must be disabled when stdout is not a TTY (piped), and vary by terminal. picocolors handles all of this. |
| URL validation | Regex for URL patterns | `new URL()` constructor + protocol check | The URL constructor is the standard way to validate URLs in Node.js. It throws on invalid URLs. Check `.protocol` is `http:` or `https:` to prevent `file://` or other schemes. |

**Key insight:** The "validation" for FEED-03 is not hand-rolled -- it is `parseFeed()` succeeding or throwing. The entire validation logic is: fetch the URL, pass content to `parseFeed()`, catch errors. Three lines of code using the library.

## Common Pitfalls

### Pitfall 1: Using parse() Instead of parseAsync()

**What goes wrong:** The `add` command has an async action handler (it fetches a URL). Calling `program.parse()` instead of `program.parseAsync()` does not await the async handler. The program exits immediately, before the fetch completes. No output, no error, no feed saved.

**Why it happens:** Commander docs show `parse()` in most examples. The `parseAsync()` method is mentioned separately but easy to miss. This is the single most common Commander + async mistake.

**How to avoid:** Always use `program.parseAsync(process.argv)` when ANY command handler is async. It returns a Promise -- in the entry point, either use top-level await or call `.catch()`.

**Warning signs:** The `add` command prints nothing and does not save the feed, but no error appears.

### Pitfall 2: Not Setting User-Agent Header on Fetch

**What goes wrong:** Some RSS feed servers reject requests without a `User-Agent` header, returning 403 Forbidden or a generic error page instead of the feed XML.

**Why it happens:** Native `fetch` does not set a User-Agent by default (unlike browsers). Server-side bot detection blocks requests without one.

**How to avoid:** Always include a `User-Agent` header: `{ headers: { 'User-Agent': 'podcast-dl/0.1.0' } }`.

**Warning signs:** The `add` command works with some feeds but fails with others, returning HTTP 403 or the parsed "feed" has no items.

### Pitfall 3: No Timeout on Fetch

**What goes wrong:** The user runs `add <url>` with a URL that hangs (unresponsive server). The CLI appears frozen indefinitely with no output.

**Why it happens:** Native `fetch` has no default timeout. Without one, the request waits until the TCP connection times out (which can be minutes).

**How to avoid:** Use `AbortSignal.timeout(30_000)` as the `signal` option on fetch. This aborts the request after 30 seconds and throws an error with `name === 'TimeoutError'`.

**Warning signs:** The CLI hangs for minutes on certain URLs before finally erroring.

### Pitfall 4: feedsmith parseFeed Throws on Invalid Content

**What goes wrong:** Passing non-XML content (HTML, plain text, binary) to `parseFeed()` throws an Error. If this is not caught, the CLI crashes with an unhandled exception and a stack trace.

**Why it happens:** feedsmith validates that the content is a recognized feed format (RSS, Atom, RDF, JSON Feed). If it cannot detect any format, it throws `Error("Unrecognized feed format")`. This is correct behavior -- the issue is not catching it.

**How to avoid:** Wrap `parseFeed()` in try/catch. On catch, display a user-friendly message like "URL is not a valid RSS feed" (not the raw error). Exit with non-zero code.

**Warning signs:** Running `add` with a regular website URL shows a stack trace instead of a clean error message.

### Pitfall 5: Duplicate Feed URL Check Missing

**What goes wrong:** The user runs `add <url>` twice with the same URL. Two identical entries appear in feeds.json. On download, every episode is fetched and processed twice.

**Why it happens:** The `add` command does not check `feedsStore.has(url)` before adding.

**How to avoid:** Check `store.has(url)` before proceeding with fetch + parse. If the feed exists, print a warning and exit without error.

**Warning signs:** `list` shows the same feed URL appearing multiple times.

### Pitfall 6: Feed Title Extraction Fails Silently

**What goes wrong:** The feed is valid RSS but has no `<title>` element (rare but possible). The feed name is stored as `undefined` or empty string, making `list` and `remove` by name unusable.

**Why it happens:** Not all feeds have well-formed `<title>` elements. Some have empty titles, CDATA-wrapped titles, or rely on iTunes namespace for the title.

**How to avoid:** Use a fallback chain: `feed.title || feed.itunes?.title || 'Untitled Podcast'`. Never store an empty or undefined name.

**Warning signs:** `list` shows empty names or "undefined" entries.

## Code Examples

### Commander CLI Entry Point (Verified Pattern)

```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { registerAddCommand } from './commands/add.js';
import { registerRemoveCommand } from './commands/remove.js';
import { registerListCommand } from './commands/list.js';

const program = new Command();

program
  .name('podcast-dl')
  .description('Download podcast episodes from RSS feeds')
  .version('0.1.0');

registerAddCommand(program);
registerRemoveCommand(program);
registerListCommand(program);

// MUST use parseAsync for async action handlers
program.parseAsync(process.argv);
```

Source: [Commander.js README](https://github.com/tj/commander.js/) -- `.command()`, `.argument()`, `.action()`, `.parseAsync()` patterns.

### feedsmith Feed Parsing (Verified Pattern)

```typescript
// Parsing RSS with feedsmith
import { parseFeed } from 'feedsmith';
import type { Rss } from 'feedsmith/types';

const content = await (await fetch(url)).text();
const { format, feed } = parseFeed(content);

// format is 'rss', 'atom', 'json', or 'rdf'
// feed has format-specific properties

// For RSS feeds, access:
const rssFeed = feed as Rss.Feed<string>;
rssFeed.title;                           // Podcast title
rssFeed.items?.[0]?.title;              // Episode title
rssFeed.items?.[0]?.enclosures?.[0]?.url;  // Audio file URL
rssFeed.items?.[0]?.enclosures?.[0]?.type; // MIME type (audio/mpeg)
rssFeed.items?.[0]?.enclosures?.[0]?.length; // File size in bytes
rssFeed.items?.[0]?.guid?.value;         // Episode GUID (string)
rssFeed.items?.[0]?.guid?.isPermaLink;   // Whether GUID is a permalink
rssFeed.items?.[0]?.pubDate;             // Publication date (string in RSS format)
rssFeed.items?.[0]?.itunes?.duration;    // Duration from iTunes namespace
```

Source: [feedsmith docs](https://feedsmith.dev/parsing/), [feedsmith GitHub](https://github.com/macieklamberski/feedsmith), [jsDocs.io types](https://www.jsdocs.io/package/feedsmith).

### feedsmith Type Structure (from jsDocs.io)

```typescript
// Key feedsmith RSS types (from feedsmith/types)

// Rss.Feed<D = string> -- D is date representation (string when parsing)
interface Feed {
  title?: string;
  link?: string;
  description?: string;
  language?: string;
  pubDate?: D;
  lastBuildDate?: D;
  items?: Item[];
  image?: { url?: string; title?: string; link?: string };
  // ... plus categories, cloud, ttl, etc.
  // Namespace extensions:
  itunes?: { /* ... */ };
  podcast?: { /* ... */ };
}

// Rss.Item
interface Item {
  title?: string;
  link?: string;
  description?: string;
  guid?: { value?: string; isPermaLink?: boolean };
  pubDate?: D;
  enclosures?: Enclosure[];
  authors?: PersonLike[];
  categories?: { name?: string; domain?: string }[];
  comments?: string;
  source?: { title?: string; url?: string };
  // Namespace extensions:
  itunes?: { duration?: string; /* ... */ };
}

// Rss.Enclosure
interface Enclosure {
  url?: string;
  length?: number;
  type?: string;    // e.g., 'audio/mpeg'
}
```

Source: [jsDocs.io feedsmith](https://www.jsdocs.io/package/feedsmith) -- verified type definitions.

### picocolors Usage (Verified Pattern)

```typescript
// src/commands/*.ts
import pc from 'picocolors';

// Success messages
console.log(pc.green(`Subscribed to "${feedName}"`));

// Error messages
console.error(pc.red('Error: URL must start with http:// or https://'));

// Warning messages
console.error(pc.yellow('Feed already subscribed: ' + url));

// Info messages
console.log(pc.bold('Subscribed feeds:'));
console.log(`  ${pc.cyan(feed.name)} - ${feed.url}`);
```

Source: [picocolors GitHub](https://github.com/alexeyraspopov/picocolors).

### List Command Pattern

```typescript
// src/commands/list.ts
import { Command } from 'commander';
import pc from 'picocolors';
import { createFeedsStore } from '../state/feeds-store.js';
import { getFeedsPath } from '../state/paths.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List subscribed podcast feeds')
    .action(() => {
      const store = createFeedsStore(getFeedsPath());
      const feeds = store.getAll();

      if (feeds.length === 0) {
        console.log(pc.yellow('No feeds subscribed. Use "podcast-dl add <url>" to add one.'));
        return;
      }

      console.log(pc.bold(`Subscribed feeds (${feeds.length}):\n`));
      for (const feed of feeds) {
        console.log(`  ${pc.cyan(feed.name)}`);
        console.log(`  ${pc.dim(feed.url)}\n`);
      }
    });
}
```

### URL Validation Pattern

```typescript
// Validate URL format before fetching
function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http:// or https:// protocol');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `program.parse()` for all handlers | `program.parseAsync()` for async handlers | Commander 5.0+ (2020) | Required when any command uses async/await. Previous workaround was callback-based actions. |
| `node-fetch` for HTTP requests | Native `fetch` (global) | Node.js 21+ (stable), 18+ (experimental) | No dependency needed. Same API as browser fetch. |
| `rss-parser` for feed parsing | feedsmith | feedsmith released 2024, actively maintained | feedsmith has native TypeScript, 31 namespaces, auto-format detection. rss-parser last updated April 2023. |
| `AbortController` manual creation | `AbortSignal.timeout()` | Node.js 18+ | One-line timeout instead of manual controller + setTimeout + cleanup. |

**Deprecated/outdated:**
- `node-fetch`: Native fetch is available in Node 22+. Zero reason to add this dependency.
- `rss-parser`: Last updated April 2023. No native podcast namespace support. Requires manual `customFields` config for enclosures. feedsmith is the replacement.
- Manual `AbortController` + `setTimeout` for fetch timeouts: `AbortSignal.timeout(ms)` is the modern approach.

## Open Questions

1. **Should `remove` also purge download history for that feed?**
   - What we know: The feeds store `remove()` only removes the feed entry from `feeds.json`. The history store in `history.json` retains the GUID entries keyed by the removed feed's URL.
   - What's unclear: If the user re-adds the same feed later, should previously downloaded episodes be re-downloaded (history purged) or still tracked (history retained)?
   - Recommendation: Retain history on remove. If the user re-adds the feed, episodes they already downloaded should NOT be re-downloaded. Purging history can be added as a `--purge` flag later if needed.

2. **Should `list` show episode counts or last download info?**
   - What we know: Phase 2 does not include download functionality -- that is Phase 3.
   - What's unclear: Whether `list` should be minimal (name + URL) or show metadata (added date, feed format).
   - Recommendation: Keep `list` minimal in Phase 2: show name and URL. Add richer output (episode counts, last download) in Phase 3 or 4 when download history is populated.

3. **How to handle the shebang line in TypeScript source?**
   - What we know: TypeScript preserves shebang comments (`#!/usr/bin/env node`) at the top of source files when compiling.
   - What's unclear: Whether `tsx` (dev runner) handles shebangs correctly during development.
   - Recommendation: Add the shebang as the first line of `src/cli.ts`. For development, use `npx tsx src/cli.ts add <url>` which ignores the shebang. For production, `dist/cli.js` will have the shebang and work with `node dist/cli.js` or via npm bin link.

## Sources

### Primary (HIGH confidence)
- [Commander.js GitHub](https://github.com/tj/commander.js/) -- `.command()`, `.argument()`, `.action()`, `.parseAsync()`, `.name()`, `.version()`, ESM import pattern
- [Commander.js npm](https://www.npmjs.com/package/commander) -- v14.0.3, dual ESM/CJS, TypeScript types built-in
- [feedsmith GitHub](https://github.com/macieklamberski/feedsmith) -- `parseFeed()` universal parser, error handling ("Unrecognized feed format"), namespace support
- [feedsmith docs - Parsing](https://feedsmith.dev/parsing/) -- `parseFeed` returns `{ format, feed }`, format-specific parsers
- [feedsmith docs - Quick Start](https://feedsmith.dev/quick-start) -- Import patterns, `parseFeed` basic usage
- [feedsmith docs - Namespaces](https://feedsmith.dev/parsing/namespaces) -- iTunes namespace access pattern `feed.itunes?.author`, `item.itunes?.duration`
- [feedsmith npm](https://www.npmjs.com/package/feedsmith) -- v2.9.0, dual ESM/CJS, Node.js 14+
- [jsDocs.io feedsmith](https://www.jsdocs.io/package/feedsmith) -- Rss.Feed, Rss.Item, Rss.Enclosure type definitions with all properties
- [picocolors GitHub](https://github.com/alexeyraspopov/picocolors) -- `pc.red()`, `pc.green()`, `pc.yellow()`, `pc.bold()`, `pc.dim()`, `pc.cyan()` API

### Secondary (MEDIUM confidence)
- [Commander.js async issues](https://github.com/tj/commander.js/issues/1144) -- `parseAsync()` behavior with async action handlers, process.exit patterns
- [Commander.js extra-typings](https://github.com/commander-js/extra-typings) -- Enhanced TypeScript support for Commander (optional, not required)
- [feedsmith Hacker News](https://news.ycombinator.com/item?id=43907941) -- Community discussion confirming feedsmith as modern replacement for rss-parser

### Tertiary (LOW confidence)
- None -- all findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Commander and feedsmith verified via npm, official docs, and GitHub README. Versions confirmed. API patterns verified.
- Architecture: HIGH -- Thin command handler pattern is standard Commander.js usage. Feed validator service pattern follows project architecture research.
- Pitfalls: HIGH -- parseAsync vs parse is documented in Commander GitHub issues. feedsmith error behavior verified in official docs. User-Agent and timeout patterns are standard Node.js fetch practices.
- Type definitions: HIGH -- feedsmith types verified via jsDocs.io with complete Rss.Item, Rss.Enclosure field listings.

**Research date:** 2026-02-17
**Valid until:** 2026-05-17 (stable libraries, no fast-moving dependencies)
