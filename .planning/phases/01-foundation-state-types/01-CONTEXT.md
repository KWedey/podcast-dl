# Phase 1: Foundation -- State & Types - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Persistent state layer (JSON stores for feeds and download history) with atomic writes, shared TypeScript types, and filename sanitization utilities. All subsequent phases build on these foundations.

</domain>

<decisions>
## Implementation Decisions

### Data storage location
- Everything stays within the project directory — nothing touches `~/` or any system-wide paths
- State files live in `data/` subdirectory: `data/feeds.json`, `data/history.json`
- Downloaded MP3s live in `downloads/<podcast-name>/<episode>.mp3`
- Both `data/` and `downloads/` are gitignored

### Filename treatment
- Max filename length: 100 characters (tighter limit for readability on small screens)
- Podcast folder names: lowercase + dashes (e.g., "The Joe Rogan Experience" becomes `the-joe-rogan-experience/`)
- Episode filenames: sanitized for FAT32 safety using filenamify

### Corruption recovery
- Use `write-file-atomic` library for atomic writes (replaces manual temp+rename pattern)
- Re-downloading episodes due to lost history is acceptable — not worth extra protection
- Corruption handling approach is Claude's discretion (warn+reset vs backup+reset)

### Claude's Discretion
- Illegal character replacement strategy (dash, space, or strip)
- Exact corruption recovery behavior (warn+reset vs backup+reset)
- Corruption handling approach for feeds.json vs history.json (may differ)

</decisions>

<specifics>
## Specific Ideas

- "The entire project will be contained within the rssDownload directory — I don't want anything else touched anywhere else on my system"
- Podcast folder names should be slugified (lowercase + dashes), not raw titles
- Consider `write-file-atomic` npm package instead of hand-rolling atomic write logic

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-state-types*
*Context gathered: 2026-02-17*
