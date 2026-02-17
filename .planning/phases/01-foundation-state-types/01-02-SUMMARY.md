---
phase: 01-foundation-state-types
plan: 02
subsystem: state
tags: [typescript, feeds-store, history-store, filenamify, sanitize, atomic-write, json-persistence]

# Dependency graph
requires:
  - phase: 01-01
    provides: "TypeScript project skeleton, Feed/DownloadHistory types, atomicWriteSync helper"
provides:
  - "Feeds store with CRUD operations for podcast subscriptions (createFeedsStore)"
  - "History store for tracking downloaded episode GUIDs by feed URL (createHistoryStore)"
  - "FAT32-safe filename sanitization truncated to 100 chars (sanitizeFilename)"
  - "Slugified directory name sanitization: lowercase + dashes only (sanitizeDirName)"
affects: [02-feed-management, 03-download-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [factory-function-stores, corrupt-json-recovery, slug-sanitization]

key-files:
  created:
    - src/state/feeds-store.ts
    - src/state/history-store.ts
    - src/utils/sanitize.ts
  modified: []

key-decisions:
  - "sanitizeDirName strips all non-alphanumeric/non-dash characters for true lowercase+dashes-only output"
  - "History store never checks filesystem for MP3 files -- only reads/writes its own JSON (STATE-02)"

patterns-established:
  - "Factory function pattern: createXStore(filePath) returns object with methods"
  - "Corrupt JSON recovery: try/catch JSON.parse, return empty default on failure"
  - "Idempotent writes: markDownloaded checks for duplicates before pushing"

requirements-completed: [STATE-01, STATE-02, CLI-02]

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 01 Plan 02: State Stores & Sanitize Summary

**Feeds store and history store with atomic JSON persistence, corrupt-file recovery, and FAT32-safe filename/directory sanitization via filenamify**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T20:20:32Z
- **Completed:** 2026-02-17T20:23:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Built feeds store with getAll, add, remove, has operations using atomic JSON writes for crash safety
- Built history store tracking downloaded episode GUIDs per feed URL -- never checks filesystem for MP3 files (STATE-02)
- Both stores recover gracefully from corrupt/missing JSON files (return empty defaults, no crashes)
- Created sanitizeFilename producing FAT32-safe filenames truncated to 100 characters (user decision)
- Created sanitizeDirName producing slugified lowercase+dashes-only directory names with unknown-podcast fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Create feeds store and history store with atomic persistence** - `b9c57fb` (feat)
2. **Task 2: Create filename sanitization utility** - `7c4140a` (feat)

## Files Created/Modified
- `src/state/feeds-store.ts` - Feed subscription CRUD with atomic JSON persistence
- `src/state/history-store.ts` - Download history tracking by GUID per feed URL
- `src/utils/sanitize.ts` - FAT32-safe filename and slugified directory name sanitization

## Decisions Made
- sanitizeDirName strips all non-alphanumeric/non-dash characters (not just FAT32-illegal ones) to ensure output is truly "lowercase + dashes" as specified in user decisions
- History store uses only its own JSON data for isDownloaded checks -- filesystem MP3 existence is never consulted (STATE-02 compliance)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added non-alphanumeric character stripping in sanitizeDirName**
- **Found during:** Task 2 (Filename sanitization utility)
- **Issue:** Plan's 4-step slugify process (lowercase, whitespace->dash, collapse dashes, trim dashes) left FAT32-legal punctuation like `!` in output, violating the must_have truth "slugifies to lowercase + dashes"
- **Fix:** Added `.replace(/[^a-z0-9-]/g, '')` step between whitespace replacement and dash collapsing
- **Files modified:** src/utils/sanitize.ts
- **Verification:** `sanitizeDirName('My Podcast: Awesome!')` returns `my-podcast-awesome` (no punctuation)
- **Committed in:** 7c4140a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness -- without this fix, directory names would contain unexpected punctuation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 is now complete: all foundation modules (types, atomic write, paths, feeds store, history store, sanitize) are built
- Phase 2 (feed management) can use createFeedsStore for subscription CRUD via CLI
- Phase 3 (download engine) can use createHistoryStore for tracking and sanitize utilities for filenames
- All requirements satisfied: STATE-01, STATE-02, STATE-03 (from Plan 01), CLI-02

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (b9c57fb, 7c4140a) verified in git log.

---
*Phase: 01-foundation-state-types*
*Completed: 2026-02-17*
