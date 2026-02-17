---
phase: 03-core-download-pipeline
plan: 01
subsystem: state, services
tags: [history-store, rss-parser, episode-downloader, feedsmith, streaming, temp-file-rename]

# Dependency graph
requires:
  - phase: 01-foundation-state-types
    provides: "types.ts (Feed, Episode, DownloadHistory), history-store.ts, paths.ts, atomic-write.ts"
  - phase: 02-feed-management
    provides: "feed-validator.ts pattern for RSS fetch + feedsmith parse"
provides:
  - "HistoryEntry type with downloaded/failed status tracking"
  - "Enhanced history store with isFailed, markFailed, transparent migration from old format"
  - "getDownloadsDir() path helper"
  - "fetchEpisodes() RSS parser service extracting Episode[] from feed URLs"
  - "downloadEpisode() streaming downloader with temp file + atomic rename safety"
affects: [03-02-PLAN, download-command]

# Tech tracking
tech-stack:
  added: []
  patterns: [status-based-history-entries, transparent-format-migration, streaming-download-pipeline, temp-file-rename]

key-files:
  created:
    - src/services/rss-parser.ts
    - src/services/episode-downloader.ts
  modified:
    - src/types.ts
    - src/state/history-store.ts
    - src/state/paths.ts

key-decisions:
  - "HistoryEntry uses { guid, status } instead of bare string for downloaded/failed tracking"
  - "Old history.json format (string arrays) transparently migrated on read -- no manual migration needed"
  - "Only audio/mpeg enclosures accepted in RSS parser -- other audio formats skipped for MP3 safety"
  - "ReadableStream type assertion used to bridge Web API and Node.js stream type mismatch"

patterns-established:
  - "Upsert pattern: markDownloaded/markFailed update existing entry status or push new entry"
  - "Streaming download: fetch -> Readable.fromWeb -> pipeline -> createWriteStream with temp+rename"
  - "Format migration: detect old format in readAll() and transparently convert"

requirements-completed: [DL-01, DL-04, DL-05]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 3 Plan 1: Download Services Summary

**Enhanced history store with downloaded/failed status tracking, RSS parser extracting Episode[] via feedsmith, and streaming episode downloader with temp file + atomic rename safety**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T23:42:47Z
- **Completed:** 2026-02-17T23:44:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Enhanced types.ts with HistoryEntry interface supporting downloaded/failed status distinction
- History store now supports isFailed, markFailed with upsert semantics and transparent migration from old bare-string format
- RSS parser service extracts Episode[] from feed URLs, filtering strictly for audio/mpeg enclosures
- Episode downloader streams HTTP responses to disk via pipeline with temp file + atomic rename pattern
- Added getDownloadsDir() path helper following existing process.cwd() convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance types, history store, and paths** - `05e2e08` (feat)
2. **Task 2: Create RSS parser and episode downloader services** - `e9b16a8` (feat)

## Files Created/Modified
- `src/types.ts` - Added HistoryEntry interface with status field, updated DownloadHistory type
- `src/state/history-store.ts` - Enhanced with isFailed, markFailed, upsert pattern, old format migration
- `src/state/paths.ts` - Added getDownloadsDir() returning project-relative downloads path
- `src/services/rss-parser.ts` - fetchEpisodes() extracts Episode[] from RSS feeds via feedsmith
- `src/services/episode-downloader.ts` - downloadEpisode() streams audio to disk with temp+rename safety

## Decisions Made
- HistoryEntry uses `{ guid, status }` object format instead of bare GUID strings to support downloaded/failed distinction
- Old history.json format (bare string arrays from Phases 1-2) is transparently migrated on read -- no manual migration step needed
- RSS parser only accepts `audio/mpeg` enclosures (exact match, not startsWith) to prevent non-MP3 files being saved with .mp3 extension
- Used ReadableStream type assertion from `node:stream/web` to handle the known TypeScript type mismatch between Web API and Node.js stream types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All building blocks ready for Plan 02 (download command orchestrator)
- Plan 02 can import fetchEpisodes, downloadEpisode, enhanced history store, and getDownloadsDir without modification
- History store backward compatibility ensures existing test data from Phases 1-2 continues working

## Self-Check: PASSED

All 5 files verified on disk. Both task commits (05e2e08, e9b16a8) verified in git log.

---
*Phase: 03-core-download-pipeline*
*Completed: 2026-02-17*
