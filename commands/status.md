---
description: Show the current state of the apartment search — cached listings count, last run date, and active search profiles.
---

# Find Apartments Status

Show the current state of the apartment search system.

## Execution

1. **Read cache**: Read `~/.claude/plugins/find-apartments/data/cache.json`
   - Count total cached listings
   - Find the most recent `first_seen` date (last run date)
   - Count listings with `notified: false` (pending notification)

2. **Read config**: Read `~/.claude/plugins/find-apartments/data/config.yaml`
   - List each search profile (city, min_rooms, max_price)
   - Show Telegram status (configured yes/no)
   - List Facebook groups (if any)

## Output Format

```
## Apartment Search Status

📊 **Cache:** X listings total
📅 **Last run:** YYYY-MM-DD
⏳ **Pending notify:** Z listings

### Search Profiles
1. {city} — {min_rooms}+ rooms, max ₪{max_price}
2. {city} — {min_rooms}+ rooms

### Integrations
- Telegram: ✓ configured / ✗ not configured
- Facebook groups: N groups configured
```
