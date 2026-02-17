# Roadmap: RSS Podcast Downloader

## Overview

This roadmap delivers a CLI tool that downloads podcast episodes from RSS feeds as MP3 files for offline playback. The work flows from foundation (state persistence and types) through feed management and into the core download pipeline. Three phases deliver all v1 functionality. A fourth phase is noted for future polish work after v1 is validated in real use.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation -- State & Types** - TypeScript types, JSON stores with atomic writes, filename sanitization utilities
- [x] **Phase 2: Feed Management** - CLI commands to add/remove feeds with RSS validation (completed 2026-02-17)
- [ ] **Phase 3: Core Download Pipeline** - Episode downloading with GUID tracking, streaming, and progress output

**Deferred (v2):** Phase 4 (Polish & UX) covers POLISH-01 through POLISH-04 and ENH-01/ENH-02. Not planned until v1 is validated in real use.

## Phase Details

### Phase 1: Foundation -- State & Types
**Goal**: Persistent state layer and shared utilities exist so all subsequent features build on reliable storage
**Depends on**: Nothing (first phase)
**Requirements**: STATE-01, STATE-02, STATE-03, CLI-02
**Success Criteria** (what must be TRUE):
  1. A feeds store can persist feed entries to a JSON file and read them back across process restarts
  2. A history store can persist downloaded episode GUIDs to a JSON file and read them back across process restarts
  3. Writing to either store does not corrupt data if the process crashes mid-write (atomic write via temp file + rename)
  4. A filename sanitization utility produces FAT32-safe filenames from arbitrary podcast/episode titles (no colons, slashes, or illegal characters; truncated to safe length)
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md -- Scaffold TypeScript project, type definitions, atomic write helper, path resolution
- [ ] 01-02-PLAN.md -- Feeds store, history store, filename sanitization utility

### Phase 2: Feed Management
**Goal**: User can subscribe to and unsubscribe from podcast feeds via CLI, with validation that URLs are real RSS feeds
**Depends on**: Phase 1
**Requirements**: FEED-01, FEED-02, FEED-03
**Success Criteria** (what must be TRUE):
  1. Running `podcast-dl add <url>` with a valid RSS feed URL saves it to the feeds store and confirms success
  2. Running `podcast-dl add <url>` with an invalid or non-RSS URL rejects it with a clear error (does not save)
  3. Running `podcast-dl remove <url-or-name>` removes a previously added feed from the feeds store
  4. Feed subscriptions persist across process restarts (stored in feeds.json)
**Plans:** 2/2 plans complete

Plans:
- [ ] 02-01-PLAN.md -- Install dependencies, feed validator service, and CLI command handlers (add, remove, list)
- [ ] 02-02-PLAN.md -- CLI entry point wiring and end-to-end verification

### Phase 3: Core Download Pipeline
**Goal**: User can run a single command to check all subscribed feeds and download new episodes as MP3 files, organized by podcast, without re-downloading
**Depends on**: Phase 2
**Requirements**: DL-01, DL-02, DL-03, DL-04, DL-05, CLI-01, CLI-03
**Success Criteria** (what must be TRUE):
  1. Running `podcast-dl download` fetches RSS for all subscribed feeds and downloads audio enclosures as MP3 files
  2. Downloaded files land in `downloads/<PodcastName>/<episode>.mp3` folder structure with sanitized names
  3. Only the 5 most recent un-downloaded episodes per feed are downloaded (older episodes are skipped)
  4. Running `podcast-dl download` a second time downloads nothing (episodes tracked by GUID in history)
  5. Deleting an MP3 file from the downloads folder and re-running does NOT re-download it (history is independent of filesystem)
  6. Downloads stream to disk without buffering entire files in memory (handles large episodes)
  7. If a download is interrupted, the incomplete file is not left behind as if complete (temp file + rename pattern)
  8. Console output shows which episodes are being downloaded as they are processed
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md -- Enhance types/history store for failed state, create RSS parser and episode downloader services
- [ ] 03-02-PLAN.md -- Download command orchestrator with filtering, retry, console output, and CLI wiring

## Future Work (v2)

The following requirements are tracked but not planned as active phases. They will be scoped after v1 is validated with real podcast feeds and an actual MP3 player.

**Polish (POLISH-01 through POLISH-04):**
- Date-prefixed filenames for chronological sorting
- List feeds command with subscription status
- Dry-run/preview mode
- Download resume via HTTP Range headers

**Enhancements (ENH-01, ENH-02):**
- ID3 tag writing (podcast name, episode title, date)
- YouTube audio download

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation -- State & Types | 0/2 | Not started | - |
| 2. Feed Management | 0/2 | Complete    | 2026-02-17 |
| 3. Core Download Pipeline | 1/2 | In Progress | - |
