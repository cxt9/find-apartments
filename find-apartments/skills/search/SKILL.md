---
name: search
description: Use when orchestrating a full apartment search run — reads config, fans out parallel scraper agents per platform, collects results, deduplicates against cache, and sends Telegram notifications for new listings
---

# Search Orchestrator

Coordinates the full apartment search pipeline: scrape all platforms, dedup, notify via Telegram.

## Input

Either:
- **From config**: Read `~/.claude/plugins/find-apartments/data/config.yaml` for search profiles
- **From CLI args**: `city` and `min_rooms` provided directly (one-off search)

If CLI args are provided, use them as a single search profile. Otherwise, use all profiles from config.

## Pipeline

### Phase 1: Load Config

Read `~/.claude/plugins/find-apartments/data/config.yaml`.

If the file doesn't exist, stop and tell the user:
> "No config found. Create `~/.claude/plugins/find-apartments/data/config.yaml` with your search profiles and Telegram credentials. See the plugin README for the format."

Extract:
- `searches` — array of search profiles
- `telegram.bot_token` and `telegram.chat_id`
- `facebook_groups` — optional

### Phase 2: Load Cache

Invoke the **cache** skill to read the current cache from `~/.claude/plugins/find-apartments/data/cache.json`. Collect all known URLs.

Also check for un-notified listings (`notified: false`) — these will be retried alongside new findings.

### Phase 3: Fan Out Scrapers

For each search profile, launch scrapers:

**Parallel group (web-based, launch all at once using the Agent tool):**
- Invoke **search-yad2** skill — pass city, min_rooms, max_price
- Invoke **search-winwin** skill — pass city, min_rooms, max_price

**Sequential group (Chrome-based, one at a time):**
- Invoke **search-madlan** skill — pass city, min_rooms, max_price
- Invoke **search-facebook** skill — pass city, min_rooms, facebook_groups from config

Launch the parallel agents using the Agent tool with `run_in_background: true` for Yad2 and WinWin. Run Madlan and Facebook sequentially in the foreground.

Wait for all agents to complete and collect their listing arrays.

### Phase 4: Dedup Against Cache

Combine all listings from all scrapers into one array. For each listing:
- If `listing.url` exists in the cache AND `notified` is `true` → skip (fully processed)
- If `listing.url` exists in the cache but `notified` is `false` → include for retry
- If `listing.url` is NOT in the cache → new listing, include

### Phase 5: Update Cache

Invoke the **cache** skill to add all new listings to cache with `notified: false`.

### Phase 6: Send Telegram Notifications

Invoke the **notify** skill with the new + un-notified listings, `bot_token`, and `chat_id` from config.

If successful, invoke the **cache** skill to update `notified: true` for the notified URLs.

### Phase 7: Summary

Report to the user:

```
## Search Complete

- **Profiles searched:** N cities
- **Platforms scraped:** Yad2, WinWin, Madlan, Facebook (list which succeeded)
- **Total listings found:** X
- **New listings:** Y (not seen before)
- **Telegram notifications sent:** W messages

### Skipped Platforms
- [List any platforms that were unavailable with reason]

### Also Check Manually
- WhatsApp groups for {city} real estate
- [Any Facebook groups that couldn't be accessed]
```

## Error Recovery

- If one scraper fails, continue with the others. Report the failure in the summary.
- If Telegram fails, listings remain in cache with `notified: false` for next run.
- Never let a single platform failure abort the entire pipeline.
