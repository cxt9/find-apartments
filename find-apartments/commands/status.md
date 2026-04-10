---
description: Show the current state of the apartment search — cached listings count, last run date, Google Sheet link, and active search profiles.
---

# Find Apartments Status

Show the current state of the apartment search system.

## Execution

1. **Read cache**: Read `~/.claude/plugins/find-apartments/data/cache.json`
   - Count total cached listings
   - Find the most recent `first_seen` date (last run date)
   - Count listings with `synced_to_sheet: false` (pending sync)
   - Count listings with `notified: false` (pending notification)

2. **Read sheet ID**: Read `~/.claude/plugins/find-apartments/data/sheet-id.txt`
   - If exists, show the Google Sheet URL: `https://docs.google.com/spreadsheets/d/{sheet_id}`
   - If not, show "No Google Sheet created yet"

3. **Read config**: Read `~/.claude/plugins/find-apartments/data/config.yaml`
   - List each search profile (city, min_rooms, max_price)
   - Show Telegram status (configured yes/no)
   - Show Google Sheets status (credentials path configured yes/no)
   - List Facebook groups (if any)

## Output Format

```
## Apartment Search Status

📊 **Cache:** X listings total
📅 **Last run:** YYYY-MM-DD
⏳ **Pending sync:** Y listings
⏳ **Pending notify:** Z listings
📋 **Google Sheet:** [link](url) (or "Not created yet")

### Search Profiles
1. {city} — {min_rooms}+ rooms, max ₪{max_price}
2. {city} — {min_rooms}+ rooms

### Integrations
- Telegram: ✓ configured / ✗ not configured
- Google Sheets: ✓ configured / ✗ not configured
- Facebook groups: N groups configured
```
