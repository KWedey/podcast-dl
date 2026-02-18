# RSS Podcast Downloader

## What This Is

A CLI tool that downloads podcast episodes from RSS feeds as MP3 files, organized by podcast name, for playback on an offline MP3 player. Supports adding/removing feeds with RSS validation, streaming downloads with deduplication, and FAT32-safe filenames.

## Core Value

Reliably download podcast episodes as MP3 files so they're ready to transfer to an offline player — no accounts, no apps, no internet required for listening.

## Requirements

### Validated

- ✓ Download podcast episodes from RSS feeds as MP3 files — v1.0
- ✓ Organize downloads by podcast name (downloads/PodcastName/episode.mp3) — v1.0
- ✓ Download up to the last 5 un-downloaded episodes per feed — v1.0
- ✓ Track what's been downloaded to avoid re-downloading — v1.0
- ✓ Add and remove RSS feeds via CLI commands — v1.0
- ✓ Manual trigger to check all feeds and download new episodes — v1.0

### Active

(None yet — define in next milestone)

### Out of Scope

- YouTube audio download — follow-up milestone, not v1
- Auto-delete listened episodes — user handles manually for now
- Continuous/scheduled background monitoring — manual trigger only
- GUI or web interface — CLI only
- Audio format conversion (ffmpeg) — most feeds serve MP3
- OPML import/export — overkill for 1-5 feeds
- Concurrent downloads — unnecessary at 1-5 feed scale

## Context

Shipped v1.0 with 880 LOC TypeScript across 14 source files.
Tech stack: TypeScript (ESM), Commander, feedsmith, write-file-atomic, filenamify, picocolors.
All 13 requirements delivered and verified via 3-source cross-reference audit.

## Constraints

- **Output format**: MP3 files — the offline player expects this
- **File organization**: `downloads/<PodcastName>/<episode>.mp3` — player navigates by folder
- **Episode limit**: Max 5 un-downloaded episodes per feed — keeps storage manageable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manual trigger over scheduled | Simplicity — user runs when needed, no daemon/cron complexity | ✓ Good |
| Track downloads, not listens | User deletes listened episodes manually — tool just avoids re-downloading | ✓ Good |
| CLI feed management | Simple add/remove commands rather than config file editing | ✓ Good |
| write-file-atomic for atomic writes | Production-tested library vs hand-rolled temp+rename | ✓ Good |
| project-relative data/ directory | process.cwd() based paths, no home directory | ✓ Good |
| feedsmith for RSS parsing | Handles multiple feed formats, lightweight | ✓ Good |
| Commander for CLI | Standard Node.js CLI framework, parseAsync for async commands | ✓ Good |
| Audio-only feed validation | Reject video-only RSS feeds on add | ✓ Good |
| HistoryEntry with status | Enables failed download retry without re-downloading successes | ✓ Good |
| Streaming downloads with temp-file | No memory buffering for large files, atomic rename on completion | ✓ Good |

---
*Last updated: 2026-02-18 after v1.0 milestone*
