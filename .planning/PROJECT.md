# RSS Podcast Downloader

## What This Is

A CLI tool that downloads podcast episodes from RSS feeds as MP3 files, organized by podcast name, for playback on an offline MP3 player. You run it manually to check feeds and download new episodes.

## Core Value

Reliably download podcast episodes as MP3 files so they're ready to transfer to an offline player — no accounts, no apps, no internet required for listening.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Download podcast episodes from RSS feeds as MP3 files
- [ ] Organize downloads by podcast name (downloads/PodcastName/episode.mp3)
- [ ] Download up to the last 5 un-downloaded episodes per feed
- [ ] Track what's been downloaded to avoid re-downloading
- [ ] Add and remove RSS feeds via CLI commands
- [ ] Manual trigger to check all feeds and download new episodes

### Out of Scope

- YouTube audio download — follow-up milestone, not v1
- Auto-delete listened episodes — user handles manually for now
- Continuous/scheduled background monitoring — manual trigger only
- GUI or web interface — CLI only

## Context

- Small personal tool for a handful of feeds (1-5)
- Target device is a generic MP3 player that reads folder/file structure
- User manually deletes episodes from the download folder after listening
- Some RSS feeds serve audio as formats other than MP3 — may need conversion or filtering

## Constraints

- **Output format**: MP3 files — the offline player expects this
- **File organization**: `downloads/<PodcastName>/<episode>.mp3` — player navigates by folder
- **Episode limit**: Max 5 un-downloaded episodes per feed — keeps storage manageable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manual trigger over scheduled | Simplicity — user runs when needed, no daemon/cron complexity | — Pending |
| Track downloads, not listens | User deletes listened episodes manually — tool just avoids re-downloading | — Pending |
| CLI feed management | Simple add/remove commands rather than config file editing | — Pending |

---
*Last updated: 2026-02-17 after initialization*
