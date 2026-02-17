# Architecture Research

**Domain:** CLI podcast downloader (RSS-to-MP3)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Standard Architecture

Podcast downloader CLI tools consistently follow a pipeline architecture: parse CLI input, fetch RSS XML, extract episode metadata, filter against download history, download audio files, persist state. Every open-source tool examined (podcast-dl, podcast-downloader, poddl, podcast-rss-cli-tool) follows this same linear data flow with minor variations. This is a well-understood problem domain with no architectural ambiguity.

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  add <url>   │  │ remove <name>│  │  download    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
├─────────┴─────────────────┴─────────────────┴───────────────────┤
│                      Core Services                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Feed Manager │  │  RSS Parser  │  │  Downloader  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
├─────────┴─────────────────┴─────────────────┴───────────────────┤
│                      Data / State Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Feed Store  │  │Download State│  │  File System  │          │
│  │  (JSON)      │  │  (JSON)      │  │  (MP3 files) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Layer | Parse commands and arguments, route to appropriate service | Commander.js with subcommands (`add`, `remove`, `download`, `list`) |
| Feed Manager | CRUD operations for RSS feed subscriptions | Read/write a `feeds.json` file; validate URL before adding |
| RSS Parser | Fetch RSS XML from URL, extract episode metadata | HTTP GET + XML parsing library; extract `<enclosure>` URLs, titles, dates |
| Episode Filter | Determine which episodes are new/un-downloaded | Compare parsed episodes against download history; enforce per-feed limit (5) |
| Downloader | Stream audio files from URL to disk | HTTP GET with stream piping to `fs.createWriteStream`; organize into podcast-name folders |
| Download State | Track which episodes have been downloaded | JSON file mapping episode GUIDs to download timestamps |
| File System | Store MP3 files in organized folder structure | `downloads/<PodcastName>/<episode>.mp3` |

## Recommended Project Structure

```
src/
├── cli.ts               # Entry point: parse commands, route to handlers
├── commands/             # One file per CLI command
│   ├── add.ts            # Add a feed
│   ├── remove.ts         # Remove a feed
│   ├── download.ts       # Download new episodes from all feeds
│   └── list.ts           # List configured feeds
├── services/             # Core business logic
│   ├── feed-manager.ts   # Manage feed subscriptions (CRUD on feeds.json)
│   ├── rss-parser.ts     # Fetch and parse RSS XML into episode objects
│   ├── downloader.ts     # Download audio files to disk
│   └── episode-filter.ts # Filter episodes against history, apply limits
├── state/                # Data persistence
│   ├── feeds-store.ts    # Read/write feeds.json
│   └── history-store.ts  # Read/write download history
├── types.ts              # Shared TypeScript interfaces
└── utils.ts              # Filename sanitization, path helpers
```

### Structure Rationale

- **commands/:** Thin wrappers that parse command-specific arguments and delegate to services. Keeps CLI parsing separate from logic, making services testable without CLI.
- **services/:** Pure business logic with no CLI coupling. Each service does one thing. `download.ts` command orchestrates them: feed-manager provides URLs, rss-parser fetches metadata, episode-filter selects episodes, downloader writes files.
- **state/:** Isolates all JSON file I/O behind simple read/write interfaces. Easy to swap storage mechanism later (unlikely needed, but clean boundary).
- **Flat structure over nested:** For a tool this small (1-5 feeds, personal use), deeply nested folders add navigation overhead without benefit.

## Architectural Patterns

### Pattern 1: Pipeline Orchestration

**What:** The `download` command orchestrates a linear pipeline: get feeds, parse each, filter episodes, download files, update history. Each step produces data the next step consumes.
**When to use:** Always -- this is the core flow.
**Trade-offs:** Simple and debuggable. No parallelism between pipeline stages (not needed at this scale).

**Example:**
```typescript
// commands/download.ts
export async function downloadCommand(): Promise<void> {
  const feeds = feedsStore.getAll();

  for (const feed of feeds) {
    const episodes = await rssParser.fetchEpisodes(feed.url);
    const newEpisodes = episodeFilter.filterNew(episodes, feed, { limit: 5 });

    for (const episode of newEpisodes) {
      await downloader.download(episode, feed.name);
      historyStore.markDownloaded(feed.url, episode.guid);
    }
  }
}
```

### Pattern 2: JSON File as Database

**What:** Use plain JSON files (`feeds.json`, `history.json`) for all persistent state. Read entire file into memory, modify, write entire file back.
**When to use:** For small-scale personal tools with simple data. This project has 1-5 feeds and tracks a few dozen episode GUIDs at most.
**Trade-offs:** Zero dependencies, human-readable, easy to debug and manually edit. Does not scale (fine here -- never needs to). Risk of data loss on crash during write (mitigate with atomic write: write to temp file, then rename).

**Example:**
```typescript
// state/feeds-store.ts
interface Feed {
  name: string;
  url: string;
  addedAt: string;
}

const FEEDS_PATH = path.join(dataDir, 'feeds.json');

export function getAll(): Feed[] {
  if (!fs.existsSync(FEEDS_PATH)) return [];
  return JSON.parse(fs.readFileSync(FEEDS_PATH, 'utf-8'));
}

export function add(feed: Feed): void {
  const feeds = getAll();
  feeds.push(feed);
  fs.writeFileSync(FEEDS_PATH, JSON.stringify(feeds, null, 2));
}
```

### Pattern 3: GUID-Based Episode Identity

**What:** Use the RSS `<guid>` element (or fall back to enclosure URL) as the unique identifier for each episode. Track downloads by GUID, not by filename or title.
**When to use:** Always -- this is how podcast clients universally identify episodes.
**Trade-offs:** GUIDs are stable even when titles or URLs change. Some feeds have poorly formed or missing GUIDs (fall back to enclosure URL). Never use episode title as identifier -- titles can be duplicated or changed.

## Data Flow

### Download Flow (Primary)

```
User runs `rss-dl download`
    |
    v
[CLI Layer] parses command
    |
    v
[Feed Manager] reads feeds.json --> list of { name, url }
    |
    v
FOR EACH feed:
    |
    v
[RSS Parser] HTTP GET feed.url --> raw XML
    |
    v
[RSS Parser] parse XML --> Episode[] (guid, title, audioUrl, date)
    |
    v
[Episode Filter] reads history.json
    |  - removes already-downloaded GUIDs
    |  - sorts by date descending
    |  - takes first 5
    v
Episode[] (filtered, max 5 new)
    |
    v
FOR EACH episode:
    |
    v
[Downloader] HTTP GET episode.audioUrl
    |  - streams to downloads/<feedName>/<sanitized-title>.mp3
    |  - prints progress to stdout
    v
[History Store] appends episode GUID to history.json
```

### Feed Management Flow

```
User runs `rss-dl add <url>`
    |
    v
[CLI Layer] parses URL argument
    |
    v
[RSS Parser] fetches URL --> validates it's a valid RSS feed
    |                     --> extracts podcast title for folder name
    v
[Feed Manager] writes to feeds.json: { name, url, addedAt }
    |
    v
Confirmation printed to stdout
```

### State Files

```
~/.rss-dl/               (or project-local .rss-dl/)
├── feeds.json            # [{ name, url, addedAt }]
└── history.json          # { "feedUrl": ["guid1", "guid2", ...] }
```

### Key Data Flows

1. **Download pipeline:** Feeds store --> RSS fetch --> Episode filter --> File download --> History update. Strictly sequential per feed, no parallelism needed at 1-5 feeds.
2. **Feed management:** CLI input --> URL validation (fetch + parse to confirm valid RSS) --> Feeds store write. Validates before persisting.
3. **History check:** Before each download, check GUID against history. After each successful download, immediately persist GUID to history. This ensures interrupted runs don't re-download completed episodes.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 feeds (this project) | Sequential processing, JSON files, no concurrency needed. Simple and correct. |
| 10-50 feeds | Add concurrent feed fetching (Promise.all with concurrency limit). JSON files still fine. |
| 100+ feeds | Switch to SQLite for state. Add parallel downloads with configurable thread count. Not relevant here. |

### Scaling Priorities

1. **First bottleneck:** Network latency from sequential feed fetching. Fix: parallelize feed fetching with `Promise.allSettled`. Not needed for 1-5 feeds.
2. **Second bottleneck:** Large history.json parse time. Fix: switch to SQLite. Irrelevant at this scale (hundreds of entries, not thousands).

**Recommendation for this project:** Do not optimize. Sequential processing for 1-5 feeds is simpler, more debuggable, and fast enough. A full download cycle will take seconds for RSS fetching plus the actual download time which is I/O bound regardless of architecture.

## Anti-Patterns

### Anti-Pattern 1: Filename-Based Download Tracking

**What people do:** Check if a file with the episode title already exists on disk to determine if it was downloaded.
**Why it's wrong:** User might delete the file (they will -- that's the workflow), rename it, or move it. The tool then re-downloads everything. Episode titles can also collide across different episodes.
**Do this instead:** Track by GUID in a separate history file. The download folder is for the user to manage; the history file is for the tool to manage.

### Anti-Pattern 2: Downloading Everything Then Filtering

**What people do:** Download all episodes, then check which ones were already present.
**Why it's wrong:** Wastes bandwidth and time downloading episodes that will be discarded. Podcast feeds can have hundreds of episodes.
**Do this instead:** Parse the RSS feed metadata first (fast, small XML), filter against history, then download only the episodes that pass the filter.

### Anti-Pattern 3: Storing Full Episode Metadata in History

**What people do:** Store the entire episode object (title, description, dates, all metadata) in the history file.
**Why it's wrong:** History file grows unnecessarily large. Metadata is re-fetchable from the RSS feed. History only needs to answer "was this GUID downloaded?"
**Do this instead:** Store only GUIDs (and optionally download timestamp) in history. Keep it minimal.

### Anti-Pattern 4: Monolithic Single-File Architecture

**What people do:** Put all logic in one `index.js` -- CLI parsing, RSS fetching, downloading, state management.
**Why it's wrong:** Untestable, hard to modify, impossible to reuse components. Even for small tools, separation pays off immediately in debuggability.
**Do this instead:** Separate into commands/, services/, and state/ as described above. Each file is small but has a clear responsibility.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| RSS feed servers | HTTP GET to fetch XML | Handle timeouts, redirects, non-200 responses. Some feeds require User-Agent header. Set reasonable timeout (30s). |
| Audio file CDNs | HTTP GET with streaming | Files can be 50-200MB. Stream to disk, do not buffer in memory. Handle partial downloads / resume if possible. Follow redirects (common with CDN URLs). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI <--> Services | Direct function calls | Commands import and call service functions. No events or message passing needed. |
| Services <--> State | Direct function calls | Services call store read/write functions. Stores own the JSON file format. Services never directly read/write JSON files. |
| RSS Parser <--> Network | HTTP client abstraction | Use Node.js built-in `fetch` (available in Node 18+) or a lightweight HTTP library. RSS parser should accept a URL and return parsed episodes -- it owns the HTTP call internally. |

## Build Order (Dependency Chain)

The components have clear dependencies that dictate build order:

```
1. types.ts + utils.ts          (no dependencies, needed by everything)
      |
2. state/feeds-store.ts         (depends on: types)
   state/history-store.ts       (depends on: types)
      |
3. services/rss-parser.ts       (depends on: types, network)
   services/feed-manager.ts     (depends on: feeds-store, rss-parser for validation)
      |
4. services/episode-filter.ts   (depends on: types, history-store)
   services/downloader.ts       (depends on: types, utils for path/filename)
      |
5. commands/add.ts              (depends on: feed-manager)
   commands/remove.ts           (depends on: feed-manager)
   commands/list.ts             (depends on: feed-manager)
   commands/download.ts         (depends on: feed-manager, rss-parser,
                                  episode-filter, downloader, history-store)
      |
6. cli.ts                       (depends on: all commands, wires up Commander.js)
```

**Implication for phased roadmap:**
- **Phase 1:** Types, utils, state stores, CLI skeleton with Commander.js. Get `add`/`remove`/`list` working. No downloading yet.
- **Phase 2:** RSS parser, episode filter, downloader. Wire up the `download` command. Core value delivered.
- **Phase 3:** Polish -- progress output, error handling edge cases, filename sanitization, non-MP3 format handling.

## Sources

- [podcast-dl by lightpohl](https://github.com/lightpohl/podcast-dl) -- Most mature Node.js podcast CLI. Uses archive JSON, custom RSS parser, modular bin/ structure with 12 focused modules. HIGH confidence.
- [podcast-downloader by kuba-orlik](https://github.com/kuba-orlik/podcast-downloader) -- Minimal Node.js downloader. YAML config, log-file-based tracking, single entry point. Confirms filesystem-presence tracking is an anti-pattern (uses separate log). MEDIUM confidence.
- [podcast-rss-cli-tool](https://github.com/utlandingur/podcast-rss-cli-tool) -- TypeScript CLI tool. Commander-based, accepts URL + episode count + directory args. Validates TypeScript + Commander as viable stack. MEDIUM confidence.
- [poddl by freshe](https://github.com/freshe/poddl) -- C++ implementation. Same pipeline pattern (parse -> select -> download) confirms this is domain-universal, not language-specific. MEDIUM confidence.
- [Podcast RSS Specification (PSP-1)](https://github.com/Podcast-Standards-Project/PSP-1-Podcast-RSS-Specification) -- Authoritative spec for RSS podcast feed structure, `<enclosure>` element with url/length/type attributes. HIGH confidence.
- [Apple Podcast Requirements](https://podcasters.apple.com/support/823-podcast-requirements) -- Feed validation requirements, confirms `<guid>` and `<enclosure>` as standard elements. HIGH confidence.
- [Node.js CLI best practices (oneuptime, 2026)](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view) -- Commander.js recommended for CLI parsing, shebang for executables, bin field in package.json. MEDIUM confidence.
- [Conf library for CLI state (egghead.io)](https://egghead.io/lessons/javascript-store-state-on-filesystem-in-node-js-clis-with-conf) -- XDG-compliant state persistence for Node.js CLIs. Confirms JSON-file pattern for CLI state. LOW confidence (single source).

---
*Architecture research for: RSS Podcast Downloader CLI*
*Researched: 2026-02-17*
