# Project Research Summary

**Project:** RSS Podcast Downloader CLI
**Domain:** Podcast aggregation and offline media management
**Researched:** 2026-02-17
**Confidence:** HIGH

## Executive Summary

This is a personal-scale podcast downloader CLI tool targeting offline MP3 players. The domain is well-understood with clear architectural patterns: fetch RSS XML, extract audio enclosures, download to filesystem, track state to avoid re-downloads. Research across open-source podcast downloaders (podcast-dl, greg, castget, podget) shows universal consensus on pipeline architecture and GUID-based episode tracking.

The recommended stack is Node.js 22+ with native fetch, TypeScript for safety, feedsmith for RSS parsing (best podcast namespace support), Commander for CLI, and JSON files for state. This minimizes dependencies while providing podcast-specific features that generic XML parsers lack. The architecture follows a linear pipeline pattern with clear service boundaries, making it testable and maintainable.

The critical risk is episode re-downloading due to poor state tracking. Every major podcast client has had bugs where users download hundreds of duplicates because the tool relied on filesystem presence or unstable identifiers. The solution is GUID-based download history persisted independently from the download folder, implemented from day one. Secondary risks include filename collisions (requires sanitization for FAT32 compatibility) and RSS parsing brittleness (requires battle-tested parser with namespace support).

## Key Findings

### Recommended Stack

Node.js 22+ provides native fetch and stream APIs that eliminate HTTP library dependencies. feedsmith (2.9.0) is the clear winner for RSS parsing, offering native TypeScript support and 28+ podcast-specific namespaces (iTunes, Podcast Index, Media RSS) without requiring custom field configuration. Commander (14.0.3) handles CLI routing cleanly for simple subcommands. JSON files are the right storage mechanism at 1-5 feed scale.

**Core technologies:**
- **Node.js 22+ LTS**: Native fetch, stream.Readable.fromWeb, zero polyfills
- **TypeScript 5.9**: Catch RSS field bugs at compile time, feedsmith provides full types
- **feedsmith 2.9.0**: Purpose-built podcast RSS parser with namespace support, actively maintained
- **Commander 14.0.3**: CLI routing, subcommands, clean API for simple use cases
- **JSON files**: Persistent state for feeds and download history, atomic writes prevent corruption

**Supporting libraries:**
- **filenamify 7.0.1**: Sanitize episode titles for filesystem safety (required for FAT32 compatibility)
- **picocolors 1.1.1**: Terminal colors for user feedback (3.5x faster than chalk, 14x smaller)
- **ora 9.3.0** (optional): Progress spinner for long operations

**Avoid:**
- node-fetch (native fetch exists)
- rss-parser (last updated April 2023, no podcast namespaces)
- axios (browser-oriented, unnecessary for CLI)
- SQLite (overkill for 1-5 feeds)

### Expected Features

**Must have (table stakes):**
- Parse RSS feeds and extract audio enclosures — core functionality
- Download audio to filesystem with retry logic
- Track downloads to avoid re-downloading (GUID-based history)
- Organize by podcast into folders (`downloads/<PodcastName>/episode.mp3`)
- Add/remove feeds via CLI commands
- Limit episodes per feed (5 un-downloaded max)
- Manual trigger command (`download` or `sync`)
- Filesystem-safe filename sanitization (FAT32 compatibility)

**Should have (competitive):**
- Date-prefixed filenames (`YYYY-MM-DD_title.mp3`) for chronological sorting on MP3 player
- List feeds command showing status
- Dry-run/preview mode to see what would download
- Progress output during downloads
- Resume interrupted downloads (HTTP Range headers)
- ID3 tag writing (podcast name, episode title, date)

**Defer (v2+):**
- Audio format conversion via ffmpeg (only needed if feeds serve non-MP3)
- YouTube audio download (explicitly deferred milestone)
- OPML import/export (overkill for 1-5 feeds)
- Concurrent downloads (premature optimization)
- Playlist generation (MP3 player navigates by folder)

**Anti-features (do NOT implement):**
- Daemon/scheduled mode — adds complexity, user can wrap in cron if desired
- Per-episode metadata JSON export — clutters MP3 player filesystem
- Episode filtering by regex/date range — over-engineering for personal tool

### Architecture Approach

Podcast downloader CLIs universally follow a pipeline pattern: parse CLI → fetch feeds → extract episodes → filter against history → download audio → persist state. The architecture has three layers: CLI (Commander subcommands), Services (feed manager, RSS parser, downloader, episode filter), and State (JSON files for feeds and history). Services are decoupled from CLI for testability.

**Major components:**
1. **Feed Manager** — CRUD on feeds.json, validates URLs before storing
2. **RSS Parser** — HTTP GET + XML parsing, extracts enclosure URLs/titles/dates/GUIDs with namespace support
3. **Episode Filter** — Compares parsed episodes against history.json, enforces 5-episode limit, sorts by date
4. **Downloader** — Streams audio from URL to disk using native fetch + pipeline(), organizes into podcast folders
5. **Download State** — Tracks episode GUIDs (not filenames) in history.json to prevent re-downloads

**Data flow:** Feeds store → RSS fetch (per feed) → Episode filter (GUID check + limit) → File download (stream to disk) → History update (append GUID). Strictly sequential per feed; no concurrency needed at 1-5 feed scale.

**Project structure:**
```
src/
├── cli.ts               # Entry point with Commander setup
├── commands/            # add.ts, remove.ts, download.ts, list.ts
├── services/            # feed-manager, rss-parser, downloader, episode-filter
├── state/               # feeds-store.ts, history-store.ts (JSON I/O)
├── types.ts             # Shared interfaces
└── utils.ts             # Filename sanitization, path helpers
```

**Key patterns:**
- GUID-based episode identity — RSS `<guid>` element is stable across URL/title changes
- JSON file as database — atomic writes (temp file + rename) prevent corruption
- Pipeline orchestration — linear flow, each step consumes previous step's output

### Critical Pitfalls

1. **Episode re-downloading** — Using filenames or filesystem presence to track downloads fails when users delete listened episodes (which is the entire workflow). Solution: GUID-based history persisted in history.json, independent of download folder. Test by deleting a file and re-running.

2. **Filename collisions/unsafe characters** — Podcast titles contain colons, quotes, slashes, emoji. FAT32 (MP3 player filesystem) rejects many characters. Solution: Sanitize from day one with filenamify, strip illegal characters, truncate to 200 chars, prepend date for uniqueness and chronological sorting.

3. **Enclosure URL redirects** — Podcast analytics services (Chartable, Podtrac) wrap audio URLs in 2-5 redirect hops. Solution: HTTP client must follow redirects (native fetch does), set User-Agent header, verify downloaded file is actually audio (not HTML error page saved as .mp3).

4. **RSS parsing fragility** — Real feeds use multiple namespaces (iTunes, Podcast Index, Media RSS), contain CDATA, HTML entities, sometimes invalid XML. Generic XML parsers fail. Solution: Use feedsmith which handles podcast namespaces natively and tolerates malformed feeds. Test with 5+ feeds from different hosting providers.

5. **Incomplete downloads treated as complete** — Network interruption leaves partial MP3 file, tool records as downloaded, user gets truncated episode. Solution: Download to temp file (.mp3.tmp), verify size against Content-Length, rename only on success, never mark as downloaded until file is complete.

## Implications for Roadmap

Based on combined research, the roadmap should follow natural dependency order: state layer → services → CLI wiring. The architecture research shows clear component boundaries that map to buildable phases.

### Suggested Phase Structure

**Phase 1: Foundation — State & Types**
- **Rationale:** All features depend on persistent state. Get storage right first — retrofitting atomic writes or changing formats later risks data loss.
- **Delivers:** TypeScript types, JSON stores (feeds, history) with atomic writes, utils (filename sanitization, path helpers).
- **Addresses:** State corruption pitfall (#8), filesystem-safe filenames pitfall (#2).
- **Research flag:** Standard patterns, skip phase research.

**Phase 2: Feed Management**
- **Rationale:** User needs to subscribe before downloading. Feed validation (confirm RSS is parsable) prevents bad URLs from entering system.
- **Delivers:** CLI commands (add, remove, list), feed manager service, RSS parser service, Commander setup.
- **Addresses:** RSS parsing fragility pitfall (#4).
- **Research flag:** Standard patterns, skip phase research.

**Phase 3: Core Download Pipeline**
- **Rationale:** This is the primary value — download episodes without re-downloading. All critical pitfalls converge here.
- **Delivers:** Episode filter (GUID-based, 5-episode limit), downloader (streaming to disk, temp file pattern), download command, history tracking.
- **Addresses:** Episode re-downloading (#1), enclosure redirects (#3), incomplete downloads (#5), "latest 5 un-downloaded" logic (#6), non-MP3 formats (#7).
- **Research flag:** Skip research (well-documented). Focus on verification testing.

**Phase 4: Polish & UX**
- **Rationale:** Core works, now improve user feedback and output quality.
- **Delivers:** Progress output during downloads, date-prefixed filenames (YYYY-MM-DD_title.mp3), dry-run mode, better error messages.
- **Addresses:** No progress feedback pitfall (#11), missing publication dates (#9).
- **Research flag:** Standard patterns, skip phase research.

**Phase 5: Enhancements (v1.x)**
- **Rationale:** Defer until v1 is validated in real use.
- **Delivers:** Download resume (Range headers), ID3 tag writing, concurrent feed fetching (if needed).
- **Research flag:** ID3 library research needed for tag writing.

### Phase Ordering Rationale

- **State before logic:** Download history must exist before downloads can check against it. JSON stores are dependencies for all services.
- **Feed management before downloading:** Cannot download without subscribed feeds. RSS parser is shared between feed validation (add command) and episode fetching (download command).
- **Serial pipeline:** No parallelism needed at 1-5 feeds. Sequential processing is simpler, more debuggable, and fast enough (seconds for feed fetching, minutes for actual downloads which are I/O-bound).
- **Critical pitfalls addressed early:** GUID-based tracking, filename sanitization, atomic writes are foundational patterns that cannot be retrofitted cleanly. Build them into Phase 1-3, not bolted on later.

### Research Flags

**Needs research during planning:**
- **Phase 5 (ID3 tagging):** Research which ID3 library works with ESM, handles MP3 specifically, minimal dependencies. Candidates: node-id3, id3-writer.

**Standard patterns (skip research-phase):**
- **Phase 1-4:** CLI argument parsing, JSON file I/O, HTTP download with streams, RSS parsing (with feedsmith) are well-documented and follow established Node.js patterns. Research already complete.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified via npm registry (versions, update dates, downloads). feedsmith advantage confirmed through GitHub inspection and npm metadata. Native fetch patterns validated in Node.js docs. |
| Features | HIGH | Feature expectations drawn from analysis of 6+ open-source podcast downloaders across multiple languages. Table stakes features are universal. Anti-features identified through GitHub issues documenting user complaints. |
| Architecture | HIGH | Pipeline pattern is domain-universal (confirmed in Node.js, Python, C++, shell implementations). Component boundaries map directly to existing open-source projects. No architectural ambiguity. |
| Pitfalls | HIGH | All critical pitfalls sourced from real bugs in production podcast clients (gPodder, AntennaPod, Clementine issues). Prevention strategies validated against podcast hosting documentation (Blubrry, Apple Podcasts). |

**Overall confidence:** HIGH

### Gaps to Address

- **ID3 library selection:** Deferred to Phase 5 planning. Need to research ESM-compatible ID3 libraries with MP3-specific support.
- **Non-MP3 format handling:** Phase 3 will implement skip-with-warning for non-MP3 enclosures. Audio conversion (ffmpeg) deferred to v2+ per project requirements.
- **Download resume implementation:** Deferred to Phase 5. Requires HTTP Range header support and partial file detection — well-documented pattern but needs implementation planning.
- **MP3 player FAT32 testing:** Verify sanitized filenames work on actual FAT32 filesystem during Phase 1 testing (not just macOS APFS).

## Sources

### Primary (HIGH confidence)
- npm registry (verified 2026-02-17) — versions, update dates, module formats for feedsmith, commander, filenamify, picocolors, ora
- Node.js v22 documentation — native fetch, stream.Readable.fromWeb, pipeline() APIs
- Podcast RSS Specification (PSP-1) — enclosure tag structure, GUID element
- Apple Podcast Requirements — feed validation rules
- feedsmith GitHub (2.9.0) — TypeScript types, namespace support (28+ podcast namespaces), enclosure preservation
- podcast-dl GitHub (lightpohl) — reference Node.js implementation with modular structure and JSON archive tracking
- gPodder issues (#1185, #1407, #1685) — re-download bugs, GUID tracking failures, filename sanitization issues
- AntennaPod issue #580 — filename collision bug (episodes overwritten)

### Secondary (MEDIUM confidence)
- greg (Python CLI) — feed management patterns, command structure
- castget (C) — ID3 tagging approach
- podget (shell) — cron optimization patterns (anti-pattern for this project)
- poddl (C++) — episode limit flags, date-based naming
- rss-podcast-downloader (Python) — SQLite tracking (overkill here), clean filenames approach
- Blubrry podcast hosting documentation — tracking redirect implementation, filename best practices
- Node.js CLI best practices (oneuptime 2026) — Commander.js recommendation, bin field setup

### Tertiary (LOW confidence)
- Conf library (egghead.io) — XDG-compliant state paths (defer unless needed)

---
*Research completed: 2026-02-17*
*Ready for roadmap: yes*
