---
phase: 03-core-download-pipeline
plan: 02
subsystem: commands
tags: [download-command, cli-orchestrator, episode-filtering, retry-logic, console-output]

# Dependency graph
requires:
  - phase: 01-foundation-state-types
    provides: "types.ts (Feed, Episode), feeds-store.ts, history-store.ts, paths.ts, sanitize.ts"
  - phase: 02-feed-management
    provides: "CLI entry point with registerXCommand pattern, Commander setup"
  - phase: 03-core-download-pipeline
    plan: 01
    provides: "fetchEpisodes, downloadEpisode, enhanced history store with markFailed/isFailed, getDownloadsDir"
provides:
  - "podcast-dl download command orchestrating full pipeline"
  - "filterEpisodes: 5 most recent un-downloaded episodes per feed, oldest-first"
  - "buildEpisodePath: downloads/<PodcastName>/YYYY-MM-DD_Episode-Title.mp3"
  - "Retry-once logic for failed downloads with failed/downloaded history tracking"
  - "Grouped console output with per-feed headers, episode status, and end-of-run summary"
affects: [v2-enhancements, parallel-downloads, retry-flags]

# Tech tracking
tech-stack:
  added: []
  patterns: [command-orchestrator-pipeline, sequential-feed-processing, filter-sort-take-reverse, retry-once-pattern]

key-files:
  created:
    - src/commands/download.ts
  modified:
    - src/cli.ts

key-decisions:
  - "filterEpisodes and buildEpisodePath are module-private helpers, not exported"
  - "No new dependencies -- reuses existing picocolors, commander, and all Phase 3 Plan 1 services"

patterns-established:
  - "Pipeline orchestrator: init stores -> iterate feeds -> filter episodes -> download -> update history -> summarize"
  - "Retry-once: attempt download, on failure retry once, then mark failed and continue"
  - "Console output grouping: bold cyan feed headers, indented episode status lines, dim for skipped/no-new"

requirements-completed: [DL-02, DL-03, CLI-01, CLI-03]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 3 Plan 2: Download Command Summary

**Download command orchestrator with feed iteration, 5-most-recent episode filtering, retry-once downloads, GUID-based deduplication, and grouped console output with summary**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T23:47:53Z
- **Completed:** 2026-02-17T23:49:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created download command orchestrator implementing the full podcast download pipeline
- Episode filtering: removes already-downloaded via GUID history, takes 5 most recent, downloads oldest-first
- File naming: downloads/<sanitized-podcast-name>/YYYY-MM-DD_Episode-Title.mp3 with 80-char title truncation
- Retry-once on download failure with markFailed/markDownloaded history tracking
- Grouped console output: bold cyan feed headers, per-episode status, skipped/no-new in dim, end-of-run summary
- Wired into CLI entry point alongside existing add/remove/list commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Create download command orchestrator** - `fa01f7c` (feat)
2. **Task 2: Wire download command into CLI and verify end-to-end** - `28941bf` (feat)

## Files Created/Modified
- `src/commands/download.ts` - Download command orchestrator with full pipeline: filter, download, retry, history, console output
- `src/cli.ts` - Added import and registration of registerDownloadCommand

## Decisions Made
- filterEpisodes and buildEpisodePath are module-private helpers (not exported) -- they are implementation details of the download command
- No new dependencies added -- reuses picocolors, commander, and all services from Plan 1

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 is functionally complete: all core download pipeline requirements implemented
- The podcast-dl tool now supports the full workflow: add feeds, list feeds, remove feeds, download episodes
- v1.0 milestone feature set is complete pending any remaining phases in the roadmap

## Self-Check: PASSED

All 2 files verified on disk. Both task commits (fa01f7c, 28941bf) verified in git log.

---
*Phase: 03-core-download-pipeline*
*Completed: 2026-02-17*
