# Feature Research

**Domain:** Podcast downloader CLI tool (RSS-based, offline MP3 player target)
**Researched:** 2026-02-17
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features a podcast downloader CLI must have to be functional. Missing any of these means the tool does not solve its core problem.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Parse RSS/Atom feeds and extract audio enclosures | This is the entire point of the tool -- every competitor does this (podcast-dl, castget, greg, podget, poddl) | MEDIUM | Must handle `<enclosure>` tags with various MIME types (audio/mpeg, audio/x-m4a, audio/ogg). RSS feeds vary wildly in quality and structure. Use a battle-tested XML/RSS parser, not hand-rolled parsing. |
| Download audio files to local filesystem | Core function. Without this there is no tool. | LOW | HTTP GET with proper error handling, timeouts, and retry logic. podcast-dl defaults to 3 retry attempts. |
| Track downloaded episodes to avoid re-downloading | Every serious tool does this (podcast-dl uses JSON archive, rss-podcast-downloader uses SQLite, greg uses a feeddump file, castget tracks internally). Without it, the tool re-downloads everything on each run. | MEDIUM | Need a persistent store mapping episode GUIDs to download status. JSON file is simplest; SQLite is more robust but overkill for 1-5 feeds. |
| Organize downloads by podcast name into folders | The target MP3 player navigates by folder. `downloads/<PodcastName>/episode.mp3` is the standard pattern used by greg (`~/Podcasts/<feedname>/`) and podcast-dl (`./{{podcast_title}}/`). | LOW | Sanitize podcast names for filesystem safety (strip special chars, handle unicode). |
| Add/remove RSS feeds via CLI commands | greg has `greg add <name> <url>` and `greg remove <name>`. Castget uses a config file. CLI commands are more ergonomic than editing config files. | LOW | Store feed list in a simple JSON or config file. CLI wraps read/write operations. |
| Limit episodes downloaded per feed | The project specifies "up to 5 un-downloaded episodes." podcast-dl has `--limit`, poddl has `-t N`, rss-podcast-downloader has `--num-episodes`. Essential for storage management on a small MP3 player. | LOW | Count against the download-tracking store. Only fetch the N most recent un-downloaded episodes. |
| Manual trigger to check and download | User runs a command, tool checks all feeds, downloads new episodes. This is the standard CLI model (greg sync, podget run). No daemon, no cron required. | LOW | Single command that iterates all feeds, checks for new episodes, downloads up to the limit. |
| Filesystem-safe filenames | Every tool addresses this. rss-podcast-downloader converts to "clean, ASCII-only, filesystem-friendly filenames." AntennaPod issue #580 documents episodes being overwritten when filenames collide. Critical for MP3 player compatibility. | MEDIUM | Strip/replace special characters, handle unicode, ensure uniqueness (append date or GUID fragment if titles collide). Target MP3 players often have limited filesystem support (FAT32). |

### Differentiators (Competitive Advantage)

These are not required for the tool to work, but would meaningfully improve the experience for this specific use case (offline MP3 player with limited storage).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Meaningful episode filenames with dates | MP3 players sort by filename. Using format like `YYYY-MM-DD_episode-title.mp3` (as rss-podcast-downloader does) means episodes appear in chronological order on the player without needing metadata support. | LOW | Parse `<pubDate>` from RSS (RFC 822 format), prepend to sanitized title. |
| List feeds command showing status | `rss list` showing subscribed feeds with episode counts, last download date. Greg has `greg info`. Gives user quick visibility without downloading. | LOW | Read from feed store, display formatted table. |
| Dry-run / preview mode | Show what would be downloaded without downloading. podcast-dl has `--info` and `--list`. Useful for verifying feeds are parsed correctly and seeing what is coming. | LOW | Parse feeds, display episode list, skip download step. |
| Progress output during downloads | Show which episode is downloading, progress percentage, total count. Without this, long downloads feel like the tool is hanging. | LOW | Print status lines during download. A progress bar is nice but not essential; even simple "Downloading 3/5: Episode Title..." suffices. |
| Resume interrupted downloads | If a download is interrupted mid-file, resume from where it left off rather than restarting. rss-podcast-downloader supports this. Uses HTTP Range headers. | MEDIUM | Check for partial files, send `Range` header. Server must support byte-range requests (most podcast CDNs do). |
| ID3 tag writing | Write podcast name, episode title, and date into MP3 ID3 tags. castget and greg both do this. Some MP3 players display ID3 metadata instead of filenames. | MEDIUM | Requires an ID3 library. Only applies to MP3 files. Worth doing because the target is an MP3 player that may use tags for display. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but add complexity disproportionate to value for this personal tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Audio format conversion (ffmpeg) | Some feeds serve M4A/AAC/OGG instead of MP3. podcast-dl supports `--audio-format` conversion via ffmpeg. | Adds a hard external dependency (ffmpeg must be installed). Conversion is slow. For 1-5 personal feeds, you can just pick feeds that serve MP3, which is the vast majority. | Filter for MP3 enclosures only. Log a warning if a feed serves non-MP3. If conversion becomes truly needed, add it as a follow-up milestone. |
| Scheduled/daemon mode | podget is "optimized for cron." Users want automated downloads. | Adds process management complexity (cron setup, PID files, lock files to prevent concurrent runs). For a personal tool with 1-5 feeds, manually running a command takes 2 seconds. | Keep it manual. User can wrap in cron themselves if they want, but the tool should not manage scheduling. |
| OPML import/export | podget supports OPML import. Useful for migrating from another podcast app. | Over-engineered for 1-5 feeds. OPML parsing adds complexity for something you will do exactly once (if ever). | User adds feeds one at a time with `add` command. With 1-5 feeds, this takes under a minute. |
| Per-episode metadata JSON export | podcast-dl writes JSON metadata per episode. Useful for archivists. | This is an archival/data-hoarding feature. The target use case is "listen on MP3 player then delete." Metadata files would clutter the player's filesystem. | Do not write metadata files. If needed later, add as a flag. |
| Playlist generation (M3U/ASX) | podget and castget auto-generate playlists. | The target MP3 player likely does not support M3U playlists and navigates by folder. Extra files on the player are clutter. | Rely on folder-based organization. If the player supports playlists, add as a flag later. |
| Concurrent/parallel downloads | podcast-dl supports `--threads`. Speeds up bulk downloads. | For 1-5 feeds with max 5 episodes each, you are downloading at most 25 files. Sequential download with good error handling is simpler and plenty fast. Concurrent downloads add complexity (thread/worker management, error aggregation, rate limiting). | Download sequentially. Total download time for 25 episodes is maybe 10 minutes -- acceptable for a manual trigger. |
| Episode transcript download | podcast-dl supports `--include-episode-transcripts`. | Irrelevant for an MP3 player. Adds file clutter. | Do not implement. |
| Episode filtering by regex/date range | podcast-dl has `--episode-regex`, `--after`, `--before`. Greg has Python expression filters. | Over-engineering for a personal tool. The "last 5 un-downloaded" rule is sufficient filtering. Adding regex/date filters adds CLI complexity and edge cases. | Stick with the episode limit. If a specific episode is needed, the user can find the direct URL and download manually. |
| GUI or web interface | podgrab has a full web UI with integrated player. | Completely out of scope. This is a CLI tool. A GUI would be a different product. | CLI only, as specified in PROJECT.md. |

## Feature Dependencies

```
[RSS Feed Parsing]
    +--requires--> [Feed Storage (add/remove)]
    +--requires--> [Download Tracking Store]
    +--enables---> [Episode Download]
                       +--requires--> [Filesystem-safe Filenames]
                       +--requires--> [Folder Organization by Podcast]
                       +--enables---> [Date-prefixed Filenames]
                       +--enables---> [ID3 Tag Writing]
                       +--enables---> [Download Resume]

[Feed Storage]
    +--enables---> [List Feeds Command]
    +--enables---> [Dry-run / Preview Mode]

[Episode Download]
    +--enables---> [Progress Output]
```

### Dependency Notes

- **Episode Download requires RSS Feed Parsing:** Cannot download without first extracting enclosure URLs from feeds.
- **Episode Download requires Download Tracking:** Must know what has already been downloaded to enforce the "5 un-downloaded" limit and avoid re-downloading.
- **Episode Download requires Filesystem-safe Filenames:** Files must be written with valid names. This is not optional -- it is part of the download path.
- **Date-prefixed Filenames enhances Episode Download:** Adds chronological sorting but requires parsing `<pubDate>` from feed items.
- **ID3 Tag Writing enhances Episode Download:** Post-processing step after download completes. Requires the download to exist first.
- **List Feeds and Dry-run enhance Feed Storage:** Both read from the feed store but do not modify it.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to solve the core problem of "download podcast episodes for offline listening."

- [x] RSS feed parsing with enclosure extraction -- the core capability
- [x] Add/remove feed CLI commands -- must be able to manage subscriptions
- [x] Download episodes to `downloads/<PodcastName>/` -- organized output
- [x] Track downloads to avoid re-downloading -- prevents waste
- [x] Limit to 5 most recent un-downloaded episodes per feed -- storage management
- [x] Manual trigger command (`download` or `sync`) -- the primary action
- [x] Filesystem-safe filename sanitization -- prevents crashes and player incompatibility
- [x] Basic console output showing download progress -- user feedback

### Add After Validation (v1.x)

Features to add once core is working and the tool is being used regularly.

- [ ] Date-prefixed filenames (`YYYY-MM-DD_title.mp3`) -- add when you find yourself wanting chronological order on the player
- [ ] List feeds command with status -- add when managing feeds becomes annoying without visibility
- [ ] Dry-run/preview mode -- add when you want to check feeds without committing to downloads
- [ ] Download resume for interrupted transfers -- add if you encounter large files or unreliable connections
- [ ] ID3 tag writing (podcast name, episode title, date) -- add if your MP3 player displays metadata

### Future Consideration (v2+)

Features to defer until the tool has proven useful and limitations are felt.

- [ ] Audio format conversion via ffmpeg -- only if you subscribe to a feed that does not serve MP3
- [ ] YouTube audio download -- explicitly listed as a follow-up milestone in PROJECT.md
- [ ] OPML import -- only if migrating from another app with many feeds

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| RSS feed parsing + enclosure extraction | HIGH | MEDIUM | P1 |
| Add/remove feed commands | HIGH | LOW | P1 |
| Episode download with retry | HIGH | LOW | P1 |
| Download tracking (avoid re-download) | HIGH | MEDIUM | P1 |
| Folder organization by podcast name | HIGH | LOW | P1 |
| Filesystem-safe filenames | HIGH | LOW | P1 |
| Episode limit (5 per feed) | HIGH | LOW | P1 |
| Manual sync/download command | HIGH | LOW | P1 |
| Basic progress output | MEDIUM | LOW | P1 |
| Date-prefixed filenames | MEDIUM | LOW | P2 |
| List feeds with status | MEDIUM | LOW | P2 |
| Dry-run / preview mode | LOW | LOW | P2 |
| Download resume (Range headers) | MEDIUM | MEDIUM | P2 |
| ID3 tag writing | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | podcast-dl (Node.js) | greg (Python) | castget (C) | podget (Shell) | poddl (C++) | Our Approach |
|---------|----------------------|---------------|-------------|----------------|-------------|--------------|
| Feed management | Single URL per run | add/remove/info | Config file | Config file | URL as arg | CLI add/remove commands |
| Download tracking | JSON archive file | feeddump file | Internal | Internal | Check existing files | JSON file per project |
| Episode limit | --limit flag | Configurable | Per-feed config | N/A | -t flag | Hardcoded 5, configurable later |
| File naming | Template system | Placeholders | Basic | Basic | Index/date options | Date + sanitized title |
| Audio conversion | ffmpeg integration | No | No | No | No | Not in v1 |
| ID3 tagging | ffmpeg-based | EyeD3 library | Built-in | No | No | Deferred to v1.x |
| Playlist generation | No | No | M3U | M3U + ASX | No | No (anti-feature) |
| Multi-feed management | No (one URL per run) | Yes | Yes | Yes | No (one URL per run) | Yes |
| Concurrent downloads | --threads | No | No | No | No | No (anti-feature for our scale) |
| Dry run / list | --info, --list | greg check | No | No | -l flag | Deferred to v1.x |

## Sources

- [podcast-dl](https://github.com/lightpohl/podcast-dl) -- Node.js CLI with comprehensive archival features (HIGH confidence)
- [greg](https://github.com/manolomartinez/greg) -- Python CLI aggregator with per-feed settings (HIGH confidence)
- [castget](https://castget.johndal.com/) -- C-based RSS downloader with ID3 tagging (MEDIUM confidence)
- [podget](https://github.com/dvehrs/podget) -- Shell-based aggregator optimized for cron (HIGH confidence)
- [poddl](https://github.com/freshe/poddl) -- C++ cross-platform batch downloader (HIGH confidence)
- [rss-podcast-downloader](https://github.com/johnsosoka/rss-podcast-downloader) -- Python tool with SQLite tracking (HIGH confidence)
- [AntennaPod #580](https://github.com/AntennaPod/AntennaPod/issues/580) -- Filename collision bug demonstrating why sanitization matters (MEDIUM confidence)
- [RSS Feed Errors Guide](https://rssvalidator.app/rss-feed-errors) -- Common RSS parsing issues (MEDIUM confidence)
- [Podcast Audio Formats](https://podnews.net/article/mp3-aac-m4a-podcasts) -- MP3 vs AAC/M4A format landscape (MEDIUM confidence)

---
*Feature research for: RSS Podcast Downloader CLI*
*Researched: 2026-02-17*
