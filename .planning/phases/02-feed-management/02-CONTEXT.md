# Phase 2: Feed Management - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

CLI commands to add/remove/list podcast feed subscriptions with RSS validation. Users can subscribe to podcast RSS feeds, unsubscribe by URL or name, and list current subscriptions. Feed validation confirms the URL is a real podcast feed with audio enclosures before saving.

</domain>

<decisions>
## Implementation Decisions

### Feed validation rules
- Only accept feeds that contain audio enclosures (actual podcast feeds) — reject valid RSS/Atom that has no audio
- Audio-only: accept mp3, m4a, and similar audio enclosures; reject video-only feeds
- YouTube channel RSS feeds are out of scope (video, not audio) — YouTube audio extraction is a v2 feature

### List display format
- Show name + URL per feed (no date added, no episode count)
- Sort alphabetically by podcast name
- No numbering — clean list without indices
- Empty state: hint message ("No feeds subscribed. Use podcast-dl add <url> to get started.")

### Claude's Discretion
- Error message wording when feed is valid RSS but has no audio enclosures
- Fetch timeout duration
- Color/formatting choices for output

</decisions>

<specifics>
## Specific Ideas

- User expressed interest in YouTube audio extraction — confirmed this is already tracked as ENH-02 in v2 roadmap
- Keep the CLI output minimal and clean — name + URL is enough info

</specifics>

<deferred>
## Deferred Ideas

- YouTube audio download / extraction — ENH-02 in v2 roadmap, requires separate pipeline (e.g., yt-dlp)

</deferred>

---

*Phase: 02-feed-management*
*Context gathered: 2026-02-17*
