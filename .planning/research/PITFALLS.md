# Pitfalls Research

**Domain:** RSS Podcast Downloader CLI Tool
**Researched:** 2026-02-17
**Confidence:** HIGH (well-documented domain with extensive open-source history)

## Critical Pitfalls

### Pitfall 1: Episode Identity Crisis -- Re-downloading Already-Downloaded Episodes

**What goes wrong:**
The tool downloads episodes it already has. This is the single most common bug in podcast downloaders. gPodder issue #1185 and #1407 both document users having 100+ files re-downloaded because the tool lost track of what was already on disk. If 5 feeds each re-download 5 episodes, the user has 25 duplicate files clogging their MP3 player.

**Why it happens:**
- Relying on filenames or URLs for identity instead of stable GUIDs. Podcast hosts change CDN URLs, add tracking prefixes, or migrate platforms -- all of which change the URL while the episode stays the same.
- Relying solely on filesystem presence for tracking (checking if the file exists on disk). If the user deletes a listened episode from the downloads folder, the tool sees it as "missing" and downloads it again.
- RSS feed GUIDs themselves can change when a podcast switches hosting platforms, making even GUID-based tracking imperfect.

**How to avoid:**
Use a persistent download history (a simple JSON file or SQLite DB) keyed on episode GUID as the primary identifier, with enclosure URL as a fallback. Never use "file exists on disk" as the sole check for "already downloaded" -- the user explicitly deletes files after listening, so the file *should* be gone but must not be re-fetched. Record the GUID + URL + download timestamp in the history. Mark episodes as "downloaded" permanently regardless of whether the file still exists.

**Warning signs:**
- During testing, delete a downloaded file and re-run -- does it re-download? If yes, the tracking is broken.
- Subscribe to the same feed twice under different URLs -- does it double-download?

**Phase to address:**
Phase 1 (Core download logic). The download history is foundational infrastructure. Getting this wrong means every subsequent feature inherits the bug.

---

### Pitfall 2: Filename Collisions and Unsafe Characters

**What goes wrong:**
Episodes overwrite each other because they generate identical filenames, or files fail to save because episode titles contain characters illegal on the target filesystem. AntennaPod issue #580 documented a bug where every episode got the same filename (the podcast title), so only the last-downloaded episode survived. gPodder issue #1685 documented downloads failing because special characters (`!`, `&`, `#`, etc.) in URLs were decoded prematurely into filenames.

**Why it happens:**
- Using the podcast title (constant across episodes) instead of the episode title or a unique identifier for the filename.
- Podcast episode titles routinely contain characters that are illegal or problematic on FAT32/exFAT filesystems (the format most MP3 players use): `? * : " < > | / \`. Unicode characters, emoji, and very long titles compound the problem.
- URL-encoded characters (`%21`, `%26`) get decoded into their literal forms which then break filesystem operations.

**How to avoid:**
Build a filename sanitizer from the start that:
1. Uses the *episode* title (not podcast title) as the base.
2. Strips or replaces filesystem-illegal characters: `? * : " < > | / \` with safe alternatives (underscore or dash).
3. Truncates to a safe maximum length (200 chars is safe across FAT32, NTFS, APFS).
4. Appends a short hash or date prefix to guarantee uniqueness even if two episodes share a title after sanitization.
5. Targets FAT32 compatibility specifically, since the output device is an offline MP3 player (FAT32 is the most restrictive common filesystem).

**Warning signs:**
- Test with feeds whose episode titles contain colons, question marks, quotes, or emoji.
- Test with a feed where multiple episodes have very similar titles.
- Check if output works on a FAT32-formatted USB drive, not just macOS APFS.

**Phase to address:**
Phase 1 (Core download logic). Filename generation is part of the download pipeline. Retrofitting sanitization later means renaming already-downloaded files and updating the history DB.

---

### Pitfall 3: Enclosure URL is Not a Simple Download Link

**What goes wrong:**
The tool treats the `<enclosure url="...">` value as a direct download link, but many podcast hosting providers wrap audio URLs in tracking redirects, CDN proxies, or analytics prefixes. The "URL" in the enclosure tag may redirect 2-5 times before reaching the actual MP3 file. If the HTTP client does not follow redirects, the download silently fails or saves an HTML error page as an MP3 file. Some servers also require specific User-Agent headers or reject requests without them.

**Why it happens:**
- Podcast analytics services (Chartable, Podtrac, Blubrry) prepend tracking URLs to the actual media URL. The enclosure URL hits the tracker, which 302-redirects to the CDN, which may redirect again.
- Some CDNs require cookies or specific headers set during the redirect chain.
- Basic HTTP libraries default to not following redirects, or limit redirect depth.

**How to avoid:**
- Use an HTTP client that follows redirects by default (Node.js `fetch` follows redirects; `axios` follows redirects). Set a reasonable redirect limit (10 is safe, 5 minimum).
- Set a realistic `User-Agent` header (e.g., `rssDownload/1.0`) so servers do not reject the request as a bot.
- After download completes, verify the file is actually an audio file (check the first few bytes for MP3 frame sync or ID3 header), not an HTML error page saved with a `.mp3` extension.
- Handle HTTP 403/401 gracefully with a clear error message -- some feeds require authentication.

**Warning signs:**
- Downloaded "MP3" files that are 0 bytes or suspiciously small (under 10KB).
- Files that have the `.mp3` extension but cannot be played.
- Downloads that work in a browser but fail in the tool.

**Phase to address:**
Phase 1 (Core download logic). This must be right in the initial HTTP download implementation.

---

### Pitfall 4: RSS Feed XML Parsing Fragility

**What goes wrong:**
The RSS parser crashes or silently returns zero episodes because the feed XML is malformed, uses unexpected namespaces, or deviates from the RSS 2.0 spec. Real podcast feeds are messy -- they include iTunes-specific namespace extensions (`<itunes:*>`), Atom links, podcast namespace tags (`<podcast:*>`), and sometimes invalid XML entirely.

**Why it happens:**
- Strict XML parsers reject feeds with a single invalid character or unclosed tag.
- Podcast feeds use multiple XML namespaces (itunes, atom, podcast, media) and the audio URL may appear in `<enclosure>`, `<media:content>`, or `<itunes:enclosure>` depending on the publisher.
- Some feeds have CDATA sections, HTML entities in titles, or UTF-8 encoding issues.
- Feed generators occasionally produce technically-invalid XML that browsers and major podcast apps tolerate but strict parsers do not.

**How to avoid:**
- Use a battle-tested RSS parsing library (like `rss-parser` for Node.js) that handles namespace variations and is tolerant of minor XML issues.
- Extract the enclosure URL with fallback logic: try `<enclosure>` first, then `<media:content>`, then `<link>`.
- Wrap feed parsing in try/catch and log which feed failed with a clear error message rather than crashing the entire run.
- Test against 5+ real feeds from different hosting providers (Spotify/Anchor, Apple, Libsyn, Podbean, self-hosted) to catch namespace variations.

**Warning signs:**
- The tool works with one test feed but fails on the second real feed you try.
- Episodes array comes back empty despite the feed clearly having episodes in a browser.
- Parser errors mentioning "namespace", "undefined element", or "invalid XML".

**Phase to address:**
Phase 1 (RSS parsing). Choose the right parser library upfront. Swapping parsers later means rewriting the entire feed-processing pipeline.

---

## Moderate Pitfalls

### Pitfall 5: Incomplete/Corrupt Downloads Treated as Complete

**What goes wrong:**
A network interruption, timeout, or server error causes a partial MP3 file to be saved. The tool records it as "downloaded" in the history. The user transfers a truncated file to their MP3 player. The episode plays for 10 minutes then cuts off mid-sentence.

**How to avoid:**
- Download to a temporary file (e.g., `episode.mp3.tmp`) and rename to the final name only after the download completes successfully.
- Verify the downloaded file size against the `Content-Length` header (if provided) or the `length` attribute from the enclosure tag.
- On any download error, delete the temp file and do NOT record the episode as downloaded in the history.
- Consider a simple integrity check: is the file larger than some minimum threshold (e.g., 100KB)? A 30-minute podcast MP3 should be ~25MB, so a 50KB "MP3" is almost certainly corrupt.

**Warning signs:**
- `.mp3.tmp` files lingering in the download directory after a run.
- Episodes that play but end abruptly.
- The download history shows an episode as downloaded but the file is suspiciously small.

**Phase to address:**
Phase 1 (Core download logic). The temp-file-then-rename pattern must be the default from the start.

---

### Pitfall 6: "Latest 5 Un-downloaded" Logic is Harder Than It Looks

**What goes wrong:**
The requirement says "download up to 5 un-downloaded episodes per feed." Naive implementation downloads the 5 most recent episodes from the feed, period. But if the user has already downloaded episodes 1-3, the tool should download episodes 4-8 (the next 5 un-downloaded ones), not re-check 1-3 and only get 4-5. Worse, some feeds list episodes in inconsistent order (not always newest-first), or paginate old episodes out of the feed entirely.

**How to avoid:**
- Define "un-downloaded" clearly: an episode whose GUID is NOT in the download history, regardless of whether the file exists on disk.
- Sort feed episodes by publication date (descending) before selecting the top 5 un-downloaded ones. Do not assume the feed's XML ordering is chronological.
- The "5 un-downloaded" window should be from the most recent episodes, not the oldest. Scan the feed's episode list, filter out already-downloaded GUIDs, take the 5 most recent remaining.
- Handle feeds with fewer than 5 new episodes gracefully (download 0-4, not crash).

**Warning signs:**
- Subscribing to a new feed downloads only 5 episodes, but re-running immediately tries to download 5 more (it should download 0).
- A feed with 100 episodes in a shuffled order produces unexpected download selections.

**Phase to address:**
Phase 1 (Core download logic). This is a core requirement that defines the download selection algorithm.

---

### Pitfall 7: Non-MP3 Audio Formats in Enclosures

**What goes wrong:**
The project requires MP3 output for the offline player. But many podcasts serve audio as M4A (AAC), OGG, OPUS, or WAV. The enclosure tag's `type` attribute may say `audio/mp4`, `audio/ogg`, or `audio/x-m4a`. The tool either crashes, skips the episode silently, or downloads a non-MP3 file that the player cannot play.

**How to avoid:**
- Check the enclosure `type` attribute before downloading. If it is `audio/mpeg` or the URL ends in `.mp3`, proceed normally.
- For non-MP3 formats: log a clear warning message like "Episode X is in M4A format, skipping (MP3 player may not support this)."
- For v1, skip non-MP3 episodes with a warning. Audio conversion (via ffmpeg) is a follow-up enhancement, not MVP scope.
- Do NOT silently download non-MP3 files and save them with a `.mp3` extension -- the player will not be able to play them and the user will have no idea why.

**Warning signs:**
- Downloaded files that will not play on the MP3 player despite appearing in the correct folder.
- The download history says episodes were downloaded but the player shows nothing.

**Phase to address:**
Phase 1 (Core download logic). Format detection and filtering is part of the download decision. Conversion is a later phase if needed.

---

### Pitfall 8: Feed Management State Corruption

**What goes wrong:**
The feeds list (where the user's subscriptions are stored) and download history get corrupted, lost, or become inconsistent. The user adds 5 feeds, runs downloads successfully for weeks, then one day the tool says "no feeds configured" or re-downloads everything.

**How to avoid:**
- Store state (feeds list + download history) in a single well-defined location. Use the tool's own directory (e.g., `~/.rssdownload/` or a data directory alongside the binary).
- Use atomic writes: write to a temp file, then rename. Never write directly to the state file -- a crash mid-write leaves a corrupt file.
- Keep the state format simple. A JSON file is fine for 1-5 feeds. Do NOT use SQLite for this scale -- it adds a dependency without benefit.
- Back up state before modifications (copy `feeds.json` to `feeds.json.bak` before writing).

**Warning signs:**
- State file is 0 bytes after a crash.
- Running `add-feed` and `list-feeds` in quick succession shows inconsistent results.

**Phase to address:**
Phase 1 (Feed management). State persistence is foundational -- every feature depends on it.

---

## Minor Pitfalls

### Pitfall 9: Ignoring Publication Dates Entirely

**What goes wrong:**
Without publication dates, the tool cannot determine episode recency. When a podcast dumps 200 episodes into its feed (common for new subscribers), the tool has no way to pick the "5 most recent" and may grab random episodes or the oldest ones.

**How to avoid:**
Parse `<pubDate>` from each item. Fall back to feed order if `<pubDate>` is missing. Log a warning if dates are absent so the user knows ordering may be unreliable.

**Phase to address:**
Phase 1 (RSS parsing).

---

### Pitfall 10: Overly Aggressive Concurrent Downloads

**What goes wrong:**
Downloading all episodes from all feeds simultaneously hammers podcast servers and may trigger rate limiting (HTTP 429) or IP bans. With 5 feeds x 5 episodes = 25 simultaneous downloads, the tool could saturate the user's connection or get blocked.

**How to avoid:**
Download sequentially within each feed, and process feeds one at a time for v1. At 1-5 feeds with 5 episodes each, sequential downloads finish in minutes and avoid all rate-limiting issues. Concurrency is premature optimization at this scale.

**Phase to address:**
Phase 1 (Core download logic). Default to sequential. Never add concurrency unless the user explicitly requests it.

---

### Pitfall 11: No Progress Feedback During Long Downloads

**What goes wrong:**
A 60-minute podcast episode is ~55MB. On a slow connection, this takes minutes. If the CLI shows nothing during download, the user thinks the tool is frozen and kills it, leaving a partial file.

**How to avoid:**
Print a simple progress indicator: at minimum, log the episode title and "downloading..." before starting, and "done (55MB)" after completing. A progress bar is nice but not required for v1.

**Phase to address:**
Phase 1 (CLI output). Basic logging should be designed from the start.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using filename existence as download check | No state file needed | Re-downloads deleted episodes forever, defeating the core use case | Never -- the user deletes files after listening by design |
| Storing feed URLs in a flat text file | Quick to implement | No room for metadata (feed name, last check time, per-feed settings) | MVP only if you plan to migrate to JSON within days |
| Hardcoding download directory | Fewer config decisions | Cannot run on different machines or change output location | Never -- make it configurable from day one |
| Skipping filename sanitization | Faster implementation | First feed with a colon in an episode title breaks everything | Never -- sanitize from the start |
| No error handling on HTTP requests | Less code | One unreachable feed crashes the entire run, skipping all remaining feeds | Never -- wrap every download in try/catch |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| RSS feed fetch | Not setting a User-Agent header | Set `User-Agent: rssDownload/1.0` -- some servers reject requests without one |
| RSS feed fetch | Not handling HTTP 301 (permanent redirect) | Follow redirects and optionally update the stored feed URL to the new location |
| Audio file download | Not following HTTP 302/307 redirect chains from tracking services | Use an HTTP client that follows redirects (at least 5 hops) |
| Audio file download | Not handling HTTP 206 (partial content) responses | Accept both 200 and 206 status codes as valid download responses |
| RSS feed fetch | Treating timeouts as permanent failures | Retry once after a timeout; only log an error if retry also fails |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Parsing entire feed XML into memory | N/A at this scale | Use streaming parser only if feeds exceed 5MB | Feeds with 500+ episodes (~500KB XML); not relevant for 1-5 feed use case |
| Re-parsing all feeds on every run | Slight slowness | Only relevant if feed count grows beyond 20+ | Not a concern at 1-5 feeds |
| Storing download history as a flat list | Slow lookups | Use a Set or Map keyed on GUID | Over 1000 downloaded episodes; unlikely for personal use |

Note: At the 1-5 feed scale, performance traps are largely irrelevant. Do not over-engineer. Sequential processing with simple data structures is the correct choice.

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Following RSS feed URLs without validation | A malicious feed could point to local files (`file:///`) or internal network addresses | Only allow `http://` and `https://` URLs for both feeds and enclosures |
| Saving files with unsanitized names from RSS data | Path traversal via episode titles like `../../etc/passwd` | Sanitize filenames, strip path separators, and always write to the configured download directory only |
| Storing private feed credentials in plaintext | Credentials exposed if machine is shared | Not relevant for v1 (public feeds only), but flag for future if private feeds are added |

## CLI UX Pitfalls

Common user experience mistakes in CLI podcast tools.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent failures -- feed parsing fails but tool exits 0 | User thinks downloads succeeded; nothing was actually downloaded | Print clear error per feed, exit with non-zero code if any feed failed |
| No dry-run mode | User cannot preview what will be downloaded before committing | Add a `--dry-run` flag that lists episodes to be downloaded without downloading |
| Unclear feed identification | User runs `list-feeds` and sees raw URLs with no names | Display the podcast title (from RSS `<title>`) alongside the URL |
| No output on success | User runs the tool, sees nothing, wonders if it worked | Print a summary: "Downloaded 3 new episodes across 2 feeds. 0 errors." |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **RSS parsing:** Works with your test feed but crashes on feeds from Anchor, Libsyn, Podbean, or self-hosted WordPress -- verify with 5+ real feeds from different providers
- [ ] **Download tracking:** Works for new downloads but re-downloads episodes when the user deletes files from the output folder -- verify by deleting a downloaded file and re-running
- [ ] **Filename generation:** Works with English titles but breaks on titles with colons, quotes, emoji, or non-ASCII characters -- verify with international podcast feeds
- [ ] **Download integrity:** File appears on disk but is actually a truncated download or an HTML error page saved as `.mp3` -- verify by checking file sizes and attempting playback
- [ ] **Feed removal:** `remove-feed` deletes the feed from the list but leaves the download history entries, causing confusion if the feed is re-added -- decide whether to keep or purge history on removal
- [ ] **Error isolation:** One broken feed URL crashes the entire run instead of skipping that feed and continuing to the next -- verify by adding an invalid URL as a feed

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Re-downloading episodes | LOW | Delete duplicates manually; fix tracking logic; rebuild history from files on disk |
| Filename collisions (episodes overwritten) | HIGH | Overwritten episodes are lost permanently; must re-download from feed; fix filename generation |
| Corrupt state file | MEDIUM | Restore from `.bak` file; if no backup, re-add feeds manually and accept re-downloads |
| Partial/corrupt downloads | LOW | Delete corrupt files; re-run tool; implement temp-file pattern to prevent recurrence |
| Non-MP3 files on MP3 player | LOW | Delete non-MP3 files from player; add format filtering to tool |
| Path traversal from malicious feed | HIGH | Audit download directory for unexpected files; sanitize filenames; restrict write paths |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Episode re-downloading (#1) | Phase 1: Core download | Delete a file, re-run, confirm no re-download |
| Filename collisions (#2) | Phase 1: Core download | Test with feeds containing special characters, duplicates |
| Enclosure URL redirects (#3) | Phase 1: Core download | Test with Podtrac/Chartable-wrapped feed URLs |
| RSS parsing fragility (#4) | Phase 1: RSS parsing | Test with 5+ real feeds from different hosting providers |
| Incomplete downloads (#5) | Phase 1: Core download | Kill the tool mid-download, verify no partial file is recorded |
| "5 un-downloaded" logic (#6) | Phase 1: Core download | Subscribe, download 5, re-run, confirm 0 new downloads |
| Non-MP3 formats (#7) | Phase 1: Core download | Subscribe to a feed that serves M4A, verify it is skipped with warning |
| State corruption (#8) | Phase 1: Feed management | Kill tool mid-write, verify state file is intact |
| Missing publication dates (#9) | Phase 1: RSS parsing | Test with a feed that omits pubDate elements |
| Concurrent download issues (#10) | Phase 1: Core download | Default to sequential; verify no rate limiting |
| No progress feedback (#11) | Phase 1: CLI output | Run a download and verify the user sees what is happening |

## Sources

- [gPodder: downloading files already downloaded (issue #1185)](https://github.com/gpodder/gpodder/issues/1185) -- re-download tracking failures
- [gPodder: podcasts downloaded multiple times (issue #1407)](https://github.com/gpodder/gpodder/issues/1407) -- GUID-based duplicate detection problems
- [gPodder: special characters in URL fail download (issue #1685)](https://github.com/gpodder/gpodder/issues/1685) -- URL encoding/decoding pitfall
- [AntennaPod: episodes overwritten due to same filename (issue #580)](https://github.com/AntennaPod/AntennaPod/issues/580) -- filename collision bug
- [Clementine: special characters replaced by blanks (issue #5971)](https://github.com/clementine-player/Clementine/issues/5971) -- filename sanitization
- [Blubrry: file naming best practices](https://blubrry.com/manual/creating-podcast-media/file-naming-urls-and-post-titles/) -- filesystem-safe naming
- [Blubrry: tracking redirect implementation](https://blubrry.com/support/statistics-documentation/instructions-for-developers/) -- how podcast analytics redirects work
- [Apple: RSS feed validation](https://podcasters.apple.com/support/829-validate-your-podcast) -- enclosure tag requirements
- [Podcast Standards Project: RSS specification](https://github.com/Podcast-Standards-Project/PSP-1-Podcast-RSS-Specification) -- namespace and enclosure standards
- [RSS.com: audio format support](https://help.rss.com/en/support/solutions/articles/44000493026-which-audio-file-formats-does-rss-com-support-) -- non-MP3 format prevalence
- [rss-podcast-downloader by johnsosoka](https://github.com/johnsosoka/rss-podcast-downloader) -- SQLite tracking approach
- [podcast-downloader by dplocki](https://github.com/dplocki/podcast-downloader) -- file-based tracking approach (and its limitations)

---
*Pitfalls research for: RSS Podcast Downloader CLI Tool*
*Researched: 2026-02-17*
