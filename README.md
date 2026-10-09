# podcast-dl

[![CI](https://github.com/KWedey/podcast-dl/actions/workflows/ci.yml/badge.svg)](https://github.com/KWedey/podcast-dl/actions/workflows/ci.yml)

A CLI tool that downloads podcast episodes from RSS feeds as MP3 files, organized by podcast name, for offline playback.

## Requirements

- Node.js >= 22.12

## Install

```bash
git clone https://github.com/KWedey/podcast-dl.git
cd podcast-dl
npm install
npm run build
```

## Usage

You can run commands two ways:

- **Dev mode** (no build step): `npx tsx src/cli.ts <command>`
- **Built mode** (after `npm run build`): `node dist/cli.js <command>`

### Add a podcast feed

```bash
npx tsx src/cli.ts add https://example.com/feed.xml
```

Validates the URL is a real RSS feed with at least one MP3 episode, then saves the subscription.

### List subscribed feeds

```bash
npx tsx src/cli.ts list
```

Shows all subscribed feeds sorted alphabetically by name.

### Remove a feed

```bash
npx tsx src/cli.ts remove "Podcast Name"
# or by URL
npx tsx src/cli.ts remove https://example.com/feed.xml
```

Matches by exact URL or case-insensitive podcast name.

### Download new episodes

```bash
npx tsx src/cli.ts download
```

For each subscribed feed:
- Fetches the RSS feed
- Downloads up to 5 most recent un-downloaded episodes (a long back catalogue arrives 5 per run)
- Saves to `downloads/<podcast-name>/<YYYY-MM-DD>_<Episode Title>.mp3`
- Tracks downloads by GUID so episodes are never re-downloaded
- Retries previously failed downloads automatically
- Exits 1 if any feed or episode failed, or a download could not be recorded in history, so scripts can tell

### Example workflow

```bash
# Subscribe to some podcasts
npx tsx src/cli.ts add https://feeds.simplecast.com/54nAGcIl
npx tsx src/cli.ts add https://lexfridman.com/feed/podcast/

# See what you're subscribed to
npx tsx src/cli.ts list

# Download new episodes
npx tsx src/cli.ts download

# Copy downloads/ folder to your MP3 player
# Delete episodes you've listened to from downloads/
# Run download again later for new episodes
npx tsx src/cli.ts download
```

## How it works

- **State** is stored in `data/feeds.json` and `data/history.json`, relative to the directory you run the command from
- **Downloads** go to `downloads/<podcast-name>/<YYYY-MM-DD>_<Episode Title>.mp3`
- Files use **atomic writes** (temp file + rename) so crashes never corrupt state
- A state file that is damaged (say, hand-edited into invalid JSON) stops every command with an error naming the file; podcast-dl never overwrites it
- Filenames are **FAT32-safe** (no colons, slashes, or illegal characters)
- Podcast folders are lowercase with dashes and keep letters in any script (`Café Society` → `café-society`)
- Downloads **stream to disk** without buffering entire files in memory
- Incomplete downloads use a temp file and are only renamed on success

## Tests

```bash
npm run check   # typecheck + all tests (what CI runs)
npm test        # tests only
```

- **Unit** (`test/unit/`): filename sanitizing, feed validation and parsing, state stores, atomic writes, streamed downloads
- **Integration** (`test/integration/`): runs the real CLI in a temp directory against a local HTTP server serving fixture feeds and fake MP3s
- Integration covers the 5-newest rule, GUID de-dup across runs, retries, dropped connections, and a process killed mid-download
- No network access, no fixed sleeps, no skipped tests

## Tech stack

TypeScript (ESM), Commander, feedsmith, write-file-atomic, filenamify, picocolors; tested with Vitest
