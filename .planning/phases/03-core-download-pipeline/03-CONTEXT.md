# Phase 3: Core Download Pipeline - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Run a single command (`podcast-dl download`) to fetch RSS for all subscribed feeds and download new episodes as MP3 files, organized by podcast, without re-downloading. Episode tracking uses GUID-based history independent of the filesystem. Downloads stream to disk with temp file + rename for safety. Limited to 5 most recent un-downloaded episodes per feed.

</domain>

<decisions>
## Implementation Decisions

### Console output
- Output grouped by feed: feed name as header, episodes indented beneath
- Show skipped episodes inline ("Skipping: Episode Title (already downloaded)")
- End-of-run summary with totals: downloaded, skipped, failed
- Failed episodes listed by name in the summary, not just a count

### Episode file naming
- Date-prefixed: `YYYY-MM-DD_Episode-Title.mp3`
- Date comes from RSS pubDate (episode publish date, not download date)
- No episode number in filename — date + title only
- Long titles truncated at ~80 characters
- Sanitization already handled by existing utility from Phase 1

### Failure handling
- Unreachable feed: log error, skip feed, continue to next feed
- Failed episode download: retry once, then skip and continue
- Failed episodes marked as "failed" in history (distinct from "downloaded")
- Successful retry on next run clears the failed state — upgrades to downloaded
- No `--retry-failed` flag for v1 — just re-run `download` (failed episodes are retried automatically)
- Total failure (all feeds unreachable): distinct error message ("No feeds could be reached — check your connection")
- Exit code non-zero if any downloads failed — useful for scripts/automation

### Multi-feed ordering
- Feeds processed alphabetically by podcast name (matches `list` command order)
- Sequential downloads — one episode at a time
- Within a feed, episodes download oldest-first (chronological)
- When no new episodes exist: show per-feed status confirming each feed was checked

### Claude's Discretion
- Console output detail level (progress bars vs simple lines)
- Exact error message wording
- HTTP streaming implementation details
- Temp file naming convention

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- `--retry-failed` flag to only retry failed episodes — not needed for v1, re-running download handles it

</deferred>

---

*Phase: 03-core-download-pipeline*
*Context gathered: 2026-02-17*
