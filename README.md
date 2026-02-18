# podcast-dl

A CLI tool that downloads podcast episodes from RSS feeds as MP3 files, organized by podcast name, for offline playback.

## Requirements

- Node.js >= 22

## Install

```bash
git clone https://github.com/KWedey/rssDownload.git
cd rssDownload
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

Validates the URL is a real RSS feed with audio enclosures, then saves the subscription.

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
- Downloads up to 5 most recent un-downloaded episodes
- Saves to `downloads/<PodcastName>/<episode>.mp3`
- Tracks downloads by GUID so episodes are never re-downloaded
- Retries previously failed downloads automatically

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

- **State** is stored in `data/feeds.json` and `data/history.json` (project-relative)
- **Downloads** go to `downloads/<PodcastName>/<episode>.mp3`
- Files use **atomic writes** (temp file + rename) so crashes never corrupt state
- Filenames are **FAT32-safe** (no colons, slashes, or illegal characters)
- Downloads **stream to disk** without buffering entire files in memory
- Incomplete downloads use a temp file and are only renamed on success

## Tech stack

TypeScript (ESM), Commander, feedsmith, write-file-atomic, filenamify, picocolors
