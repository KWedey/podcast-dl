# Stack Research

**Domain:** CLI podcast downloader (RSS feed parsing, audio file download, feed management)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS (or 24.x LTS) | Runtime | User has Node 24.11.0 installed. Node 22 LTS supported until April 2027; Node 24 LTS is current. Native `fetch`, native `stream.Readable.fromWeb()`, native ESM support -- no polyfills needed for HTTP or streaming. |
| TypeScript | 5.9.x | Type safety | Catches RSS field access bugs at compile time. feedsmith provides full TypeScript types for all feed formats and namespaces. Project is small enough that TS overhead is minimal. |
| ESM (type: "module") | -- | Module format | All recommended libraries support ESM. Node 22+ has mature ESM support. No reason to use CommonJS for a greenfield project. |

### RSS Parsing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| feedsmith | 2.9.0 | RSS feed parsing | **The clear winner for podcast use.** Built with TypeScript from the ground up. Supports 28+ namespaces including iTunes, Podcast Index, Media RSS -- the namespaces podcast feeds actually use. Preserves enclosure data (URL, type, length) natively without custom field config. Actively maintained (last updated 2026-02-13). Smaller than rss-parser (663KB vs 1.9MB unpacked). Dual ESM/CJS exports. Forgiving parser handles malformed feeds gracefully. |

### CLI Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Commander | 14.0.3 | CLI argument parsing and subcommands | This project has simple subcommands (`add`, `remove`, `download`, `list`). Commander models CLIs as command trees -- each subcommand gets its own options and action handler. TypeScript types included. 38M+ weekly downloads. Actively maintained (updated 2026-01-31). Dual ESM/CJS. Lighter weight than yargs for this simple use case. |

### HTTP & File Downloads

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native `fetch` | Built-in (Node 22+) | HTTP requests for RSS feeds and audio files | Stable in Node 22+. Zero dependencies. Use `response.text()` for RSS XML, `response.body` (ReadableStream) for streaming large audio files to disk. No need for axios, got, or node-fetch. |
| `node:stream/promises` | Built-in | Stream pipeline for file downloads | `pipeline(Readable.fromWeb(response.body), createWriteStream(path))` handles backpressure, error propagation, and cleanup automatically. Zero dependencies. |
| `node:fs` | Built-in | File system operations | `createWriteStream` for download target, `mkdir` for directory creation, `readFile`/`writeFile` for JSON state. |

### Data Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Plain JSON files | Built-in (`node:fs`) | Feed list and download history | For 1-5 feeds and a few hundred download records, a JSON file is the right tool. No ORM, no schema migrations, no native binaries. Two files: `feeds.json` (feed URLs and metadata) and `history.json` (downloaded episode GUIDs). Atomic writes via write-to-temp-then-rename pattern. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| filenamify | 7.0.1 | Sanitize filenames | Always -- podcast episode titles contain characters invalid in filenames (colons, slashes, quotes). Converts to safe filesystem names. ESM-only. |
| picocolors | 1.1.1 | Terminal colors | For colored CLI output (success/error/info messages). 3.5x faster and 14x smaller than chalk. No dependencies. |
| ora | 9.3.0 | Terminal spinner | Show progress during feed fetching and downloads. ESM-only. Optional -- could use simple console.log instead for maximum simplicity. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| TypeScript | 5.9.x | Compilation | Compile to `dist/`. Target `ES2022` or `ESNext` for Node 22+ compatibility. |
| tsx | 4.21.0 | Dev runner | Run TypeScript directly during development without compile step. Use `tsx src/index.ts` for dev, compiled JS for production/bin entry. |
| vitest | 4.0.x | Testing | Fast, TypeScript-native test runner. Understands ESM out of the box. |
| @types/node | 22.x or 24.x | Node.js types | Match to the target Node.js version. |

## Installation

```bash
# Core dependencies
npm install feedsmith commander filenamify picocolors

# Optional (progress spinner)
npm install ora

# Dev dependencies
npm install -D typescript tsx vitest @types/node
```

## Project Init

```bash
# Initialize with ESM
npm init -y
# Set "type": "module" in package.json

# TypeScript config
npx tsc --init --target ES2022 --module NodeNext --moduleResolution NodeNext \
  --outDir dist --rootDir src --strict --esModuleInterop
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| feedsmith | rss-parser 3.13.0 | If you only need basic RSS fields (title, link, description) and don't care about podcast namespaces. rss-parser requires `customFields` config to access enclosures. Last updated April 2023 -- effectively unmaintained. |
| feedsmith | @rowanmanning/feed-parser 2.1.1 | If you need cross-format normalization (RSS + Atom unified into one shape). feedsmith preserves format-specific structure which is better when you know you're parsing RSS podcast feeds. |
| feedsmith | feedparser (node-feedparser) 2.2.10 | Never. Uses old stream-based API, lodash dependencies, last meaningful update was years ago. Legacy. |
| Commander | yargs 18.0.0 | If you need complex argument validation, middleware, or interactive features. Overkill for 4 simple subcommands. Yargs has a steeper learning curve for simple CLIs. |
| Native fetch | got 14.x / axios | If you need retry logic, hooks, or advanced HTTP features built-in. For this project, native fetch + manual retry (if needed) is simpler and zero-dependency. |
| Native fetch | undici 7.x | If you need lower-level HTTP control (connection pooling, interceptors). Undici is what powers Node's native fetch internally -- no need to use it directly. |
| JSON files | better-sqlite3 12.6.x | If tracking thousands of episodes across hundreds of feeds. For 1-5 feeds, SQLite adds native binary compilation complexity for no benefit. |
| JSON files | conf 15.1.0 | If you want XDG-compliant config paths and JSON schema validation. Adds 8 transitive dependencies. For a personal tool, a `~/.rssdownload/` directory with JSON files is sufficient. |
| picocolors | chalk 5.6.2 | If you need complex styling (RGB, hex colors, nested styles). For simple green/red/yellow messages, picocolors does the same thing at a fraction of the size. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| node-fetch | Unnecessary -- Node 22+ has native fetch. Adding a polyfill for a built-in API adds confusion and dependency weight. | Native `fetch` (global) |
| rss-parser | Last updated April 2023. No native podcast namespace support. Requires manual `customFields` config to access enclosures. xml2js dependency is heavy. | feedsmith |
| feedparser (node-feedparser) | Stream-based API from the Node.js 0.x era. Multiple lodash subdependencies. Not TypeScript-typed. | feedsmith |
| axios | Large bundle, browser-oriented features (XSRF, form data) irrelevant to CLI tools. Native fetch covers all needs. | Native `fetch` |
| inquirer / prompts | Interactive prompts are wrong for a tool meant to be run as a quick manual trigger. All input should come from CLI arguments. | Commander subcommands + options |
| lowdb | JSON "database" that adds abstraction for simple read/write operations. For 2 small JSON files, `readFile` + `JSON.parse` + `writeFile` is clearer. | Native `node:fs` |
| electron / pkg | No need to bundle into a standalone binary. This is a personal tool run in a terminal with Node.js already installed. | Direct `node` / `tsx` execution, or npm bin link |

## Stack Patterns

**For this project (personal tool, 1-5 feeds):**
- Use native Node.js APIs wherever possible (fetch, streams, fs)
- Minimize dependencies -- every added package is a maintenance burden
- JSON files for state -- no database needed at this scale
- TypeScript for correctness but don't over-engineer types

**If this were a public npm package (many users, diverse feeds):**
- Add retry logic (p-retry or custom) for flaky podcast CDNs
- Add proxy support (global-agent) for corporate networks
- Consider conf for XDG-compliant config paths
- Add better-sqlite3 if tracking hundreds of feeds

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| feedsmith@2.9.0 | Node 18+ | Uses fast-xml-parser 5.x. Dual ESM/CJS. |
| commander@14.0.3 | Node 18+ | Dual ESM/CJS. TypeScript types built-in. |
| filenamify@7.0.1 | Node 18+ | ESM-only. Requires `"type": "module"` in package.json. |
| picocolors@1.1.1 | Node 14+ | Dual ESM/CJS. Zero dependencies. |
| ora@9.3.0 | Node 18+ | ESM-only. Has several sub-dependencies (cli-cursor, etc). |
| TypeScript@5.9.x | Node 18+ | Target ES2022+ for Node 22 compatibility. |

## Key Design Decision: Why Not a Database?

The project tracks two things:
1. **Feed list** -- URLs, names, maybe 1-5 entries
2. **Download history** -- episode GUIDs that have been downloaded, maybe 50-250 entries

A JSON file handles this trivially:
```typescript
// feeds.json
[
  { "url": "https://example.com/feed.xml", "name": "My Podcast" }
]

// history.json
{
  "https://example.com/feed.xml": ["guid-1", "guid-2", "guid-3"]
}
```

Read on startup, write after each download batch. Atomic write (write to `.tmp`, rename) prevents corruption. No migration scripts, no native binaries, no schema.

## Key Design Decision: Native Fetch Over HTTP Libraries

Node 22+ native fetch provides everything this project needs:
- `fetch(url)` then `response.text()` for RSS XML (small text payload)
- `fetch(url)` then `Readable.fromWeb(response.body)` piped through `pipeline()` to `createWriteStream()` for large MP3 files
- `response.headers.get('content-length')` for download progress (if implementing)
- `response.headers.get('content-type')` to verify audio MIME type
- `response.ok` / `response.status` for error handling

No library adds meaningful value over this for the project's requirements.

## Sources

- npm registry (verified via `npm view` on 2026-02-17) -- versions, update dates, module formats, dependencies for all packages
- [feedsmith GitHub](https://github.com/macieklamberski/feedsmith) -- TypeScript support, namespace coverage, API design (MEDIUM confidence)
- [rss-parser npm](https://www.npmjs.com/package/rss-parser) -- last updated April 2023, xml2js dependency (HIGH confidence, verified via npm registry)
- [Commander npm](https://www.npmjs.com/package/commander) -- v14.0.3, dual ESM/CJS (HIGH confidence, verified via npm registry)
- [podcast-dl GitHub](https://github.com/lightpohl/podcast-dl) -- reference implementation using commander + xml2js + got (MEDIUM confidence)
- [podcast-rss-cli-tool GitHub](https://github.com/utlandingur/podcast-rss-cli-tool) -- simpler reference implementation (MEDIUM confidence)
- [Node.js releases](https://nodejs.org/en/about/previous-releases) -- Node 22 LTS until April 2027, Node 24 LTS current (HIGH confidence)
- [Node.js Fetch to File pattern](https://kyleunboxed.com/nodejs-fetch-api-saving-a-webstream-to-a-file/) -- `Readable.fromWeb()` + `pipeline()` pattern (MEDIUM confidence)
- [Node.js Stream docs](https://nodejs.org/api/stream.html) -- `pipeline()` and `Readable.fromWeb()` APIs (HIGH confidence)

---
*Stack research for: RSS Podcast Downloader CLI*
*Researched: 2026-02-17*
