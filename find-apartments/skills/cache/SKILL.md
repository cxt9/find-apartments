---
name: cache
description: Use when checking if a listing URL is already cached, adding new listings to the cache, or updating the notified flag after Telegram operations
---

# Listing Cache Manager

Manages the local JSON cache at `~/.claude/plugins/find-apartments/data/cache.json`. The cache is the single source of truth for deduplication — a listing is "new" if its URL is not a key in this file.

## Cache File Format

```json
{
  "https://www.yad2.co.il/item/abc123": {
    "first_seen": "2026-04-10",
    "city": "הוד השרון",
    "price": 9000,
    "rooms": 5,
    "address": "יונה וולך 4",
    "source": "Yad2",
    "notified": true
  }
}
```

## Operations

### Check if URL is new

Read `~/.claude/plugins/find-apartments/data/cache.json` using the Read tool. If the file doesn't exist, all listings are new. Check if the listing URL exists as a key in the JSON object.

### Add new listings to cache

After scraping, for each new listing (URL not in cache), add an entry:

```bash
# Read existing cache (or start with empty object)
# Add new entries with notified: false
# Write back with the Write tool
```

Use the Read tool to read the current cache, then use the Write tool to write the updated cache. Always set `first_seen` to today's date (ISO format) and `notified` to `false` for new entries.

### Update flags after notify

After successful Telegram send, update `notified` to `true` for the notified URLs.

Read the cache, update the flags, write it back.

### Find un-notified listings

Read the cache and filter for entries where `notified` is `false` — these need to be retried for Telegram notifications.

## Data Directory

Ensure `~/.claude/plugins/find-apartments/data/` exists before reading/writing:

```bash
mkdir -p ~/.claude/plugins/find-apartments/data
```

If `cache.json` does not exist, treat it as an empty object `{}`.
